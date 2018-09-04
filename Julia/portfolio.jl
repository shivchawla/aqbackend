using YRead
using Raftaar: Security, SecuritySymbol, Portfolio, Position, OrderFill, TradeBar, Adjustment
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
using Raftaar: updateportfolio_fill!, updateportfolio_price!, updateportfolio_splits_dividends!

import Base: convert
using TimeSeries
using StatsBase
using ZipFile

include("convert.jl")
include("validate.jl")
include("adjustments.jl")
include("rtprices.jl")

format = "yyyy-mm-ddTHH:MM:SS.sssZ"

function filternan(ta::TimeArray, col = "")
    (nrows, ncols) = size(ta)
    lastname = col == "" ? colnames(ta)[ncols] : col
    ta[.!isnan.(ta[lastname].values)]
end 

function _getPricehistory(tickers::Array{String,1}, startdate::DateTime, enddate::DateTime; adjustment::Bool = false, strict::Bool = true, appendRealtime::Bool = false) 
    currentDate = Date(now())
    eod_prices = nothing

    #Added withing try catch to handle error at YRead 
    try
        #04-09-2018 - Adding forwardfill flag to avoid NaN values on the end date
        if (adjustment && strict) 
            eod_prices = YRead.history(tickers, "Close", :Day, startdate, enddate, displaylogs=false, forwardfill=true)
        else
            eod_prices = YRead.history_unadj(tickers, "Close", :Day, startdate, enddate, displaylogs=false, strict = strict, forwardfill=true)
        end
    catch err
        println(err)
    end

    #Use it twice to fix NaNs and nothing
    eod_prices = eod_prices != nothing && length(eod_prices) > 0 ? dropnan(eod_prices, :all) : nothing
    eod_prices = eod_prices != nothing && length(eod_prices) > 0 ? dropnan(eod_prices, :all) : nothing

    rtTimeArray = nothing
    try
        if appendRealtime && Date(enddate) >= currentDate 
            laststamp = eod_prices != nothing ? eod_prices.timestamp[end] : nothing

            if laststamp == nothing || (laststamp != nothing && laststamp < currentDate)
                ##HERE APPEND REAL TIME PRICES

                #COnvert the price array to right format for timearray
                rtPriceArray = Vector{Float64}()
                rtTimeStamp = nothing
                for ticker in  tickers
                    priceForTicker = NaN;
                    if haskey(_realtimePrices, ticker)
                        if rtTimeStamp == nothing
                            rtTimeStamp = Date(_realtimePrices[ticker].datetime)
                        elseif rtTimeStamp != Date(_realtimePrices[ticker].datetime)
                            error("Distinct timestamps for RT data")
                        end

                        if laststamp != nothing
                            if Date(rtTimeStamp) <= laststamp 
                                error("Realtime data is same as last day in EOD")
                            end
                        end 
                        priceForTicker = _realtimePrices[ticker].close != 0.0 ? _realtimePrices[ticker].close : NaN
                    end

                    push!(rtPriceArray,  priceForTicker)
                end

                mat = Matrix{Float64}(1, length(rtPriceArray))
                mat[1, :] = rtPriceArray
                
                rtTimeArray = TimeArray([rtTimeStamp], mat, tickers)
            end
        end
    end

    if rtTimeArray != nothing
        output = eod_prices != nothing ? [eod_prices; rtTimeArray] : rtTimeArray
    else 
        output = eod_prices
    end

    if output != nothing
        final = output[Date(startdate):Date(enddate)]
        return length(final) == 0 ? nothing : final
    else 
        return nothing
    end     
end

#Use this fucntion to updated portfolio with dividendCash accumulated
function _updatePortfolioHistory_dividendCash(portfolioHistoryCollection)
    dividendCash = 0.0

    outputTuple = Vector{Any}()

    for (i, collection) in enumerate(portfolioHistoryCollection)
        portfolio = convert(Raftaar.Portfolio, collection["portfolio"])
        startdate = DateTime(collection["startDate"], format)
        enddate = DateTime(collection["endDate"], format)
        
        last_portfolio = nothing
        last_startdate = nothing
        last_enddate = nothing
        
        if i > 1
            lastCollection = portfolioHistoryCollection[i-1]
            last_portfolio = convert(Raftaar.Portfolio, lastCollection["portfolio"])
            last_startdate = DateTime(lastCollection["startDate"], format)
            last_enddate = DateTime(lastCollection["endDate"], format)
        end
        
        tickers = [sym.ticker for (sym, pos) in portfolio.positions]
        adjustments = YRead.getadjustments(tickers, startdate, enddate)

        cashRequirement = 0.0
        for ticker in tickers
            symbol = getsecurity(ticker).symbol
            qty = portfolio[symbol].quantity

            lastqty = 0
            if last_portfolio != nothing
                lastqty = last_portfolio[symbol].quantity
            end

            if haskey(adjustments, symbol.id)
                adjustmentForSecurity = adjustments[symbol.id]
                
                for (date, adjustment) in adjustmentForSecurity

                    if (Date(date) == Date(startdate))
                        println("Adjustment on same day as startdate of portfolio. Using last known portfolio")
                        qty = lastqty
                    end

                    adjType = adjustment[3]
                    adjFactor = adjustment[2]
                    if(adjType == 17.0)
                        dividendCash += qty*adjFactor
                    end
                end
            end
        end

        portfolio.cash = dividendCash

        push!(outputTuple, (portfolio, startdate, enddate))

    end

    return outputTuple
     
end 
###
# Internal Function
# Compute portfolio value on latest date
# OUTPUT: portfolio value 
###
function _compute_latest_portfoliovalue(portfolio::Portfolio)
   
    try
        # Get the list of ticker
        secids = [sym.id for sym in keys(portfolio.positions)]    

        #get the unadjusted prices for tickers in the portfolio
        prices = YRead.history_unadj(secids, "Close", :Day, 1, currentIndiaTime(), offset = -1, displaylogs=false)

        if prices == nothing
            println("Price data not available")
            return cash
        end

        ts = prices.timestamp

        nrows = length(ts)
        portfolio_value = 0.0

        equity_value = 0.0    
        for (sym, pos) in portfolio.positions

            ticker = sym.ticker
            
            close = prices[ticker].values[end]
            equity_value += pos.quantity * close 
        end

        portfolio_value = equity_value + portfolio.cash
    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Compute portfolio value over a period
# OUTPUT: portfolio value vector
###
function _compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime; adjustment::Bool=false, excludeCash::Bool = false)
    try
        # Get the list of ticker
        tickers = [sym.ticker for sym in keys(portfolio.positions)]    

        prices = nothing
        
        if adjustment 
            #Get the ADJUSTED prices for tickers in the portfolio
            #*****TAKING  A LEAP OF FAITH AND apending realtime data*******#
            prices = _getPricehistory(tickers, start_date, end_date, adjustment = adjustment, appendRealtime=true)
        else
            #Get the UNADJUSTED prices for tickers in the portfolio (with appended realtime)
            prices = _getPricehistory(tickers, start_date, end_date, appendRealtime = true)
        end

        #Using benchmark prices to filter out days when benchmark is not available
        #Remove benchmark prices where it's NaN
        #This is imortant becuse Qaundl/XNSE has data for holidays as well
        #******BUT SOMETIMES, this can be FLAWED as NSE dataset can have missing dates
        benchmark_prices = _getPricehistory(["NIFTY_50"], start_date, end_date, strict=false, appendRealtime=true)
        merged_prices = nothing

        if prices != nothing && benchmark_prices != nothing
            merged_prices = filternan(to(from(merge(prices, benchmark_prices, :right), Date(start_date)), Date(end_date)))
        end

        if merged_prices == nothing
            println("Price data not available")
            dt_array = benchmark_prices != nothing ? benchmark_prices.timestamp : []
            if length(dt_array) == 0 
                return nothing
            end

            return TimeArray([dt for dt in dt_array], portfolio.cash*ones(length(dt_array)), ["Portfolio"])
        end

        ts = merged_prices.timestamp

        nrows = length(ts)
        portfolio_value = zeros(nrows, 1)

        for (i, date) in enumerate(ts)

            equity_value = 0.0
            
            for (sym, pos) in portfolio.positions

                ticker = sym.ticker
                
                #IMPROVEMENT: Using Last Non-NaN prices 
                _temp_ts_close_non_nan = values(dropnan(to(merged_prices[ticker], date), :any))
                _last_valid_close = length(_temp_ts_close_non_nan) > 0 ? _temp_ts_close_non_nan[end] : 0.0
                
                equity_value += pos.quantity * _last_valid_close
            end

            portfolio_value[i, 1] = equity_value + (excludeCash ? 0.0 : portfolio.cash)
        end

        return TimeArray(ts, portfolio_value, ["Portfolio"])

    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Compute portfolio value on a given date
# OUTPUT: portfolio value
###
function _compute_portfoliovalue(port::Dict{String, Any}, date::DateTime)
    try
        portfolio = convert(Raftaar.Portfolio, port)
        portfolio_value = _compute_portfoliovalue(portfolio, date, date)

        return portfolio_value.values[1]
    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Function to compute portfolio composition on a specific date
###
function _compute_portfolio_metrics(port::Dict{String, Any}, sdate::DateTime, edate::DateTime; excludeCash::Bool=false)
    try
        
        defaultOutput = excludeCash ? 
            (Date(currentIndiaTime()), [], "concentration" => 0.0) :
            (Date(currentIndiaTime()), [Dict("weight" => 1.0, "ticker" => "CASH_INR")], 0.0)

        portfolio = convert(Raftaar.Portfolio, port)

        portfolio_value_raw = _compute_portfoliovalue(portfolio, sdate, edate, excludeCash=excludeCash)
        portfolio_values = portfolio_value_raw != nothing ? dropnan(portfolio_value_raw, :any) : nothing

        if portfolio_values == nothing || length(portfolio_values) == 0 
            return defaultOutput
        end

        portfolio_value = values(portfolio_values)[end]
        latest_date = DateTime(portfolio_values.timestamp[end])

        # Get the list of ticker
        allkeys = keys(portfolio.positions)
        secids = [sym.id for sym in allkeys]
        tickers = [sym.ticker for sym in allkeys]    

        #Get the Adjusted prices for tickers in the portfolio
        prices = _getPricehistory(tickers, sdate, edate, adjustment = true, appendRealtime=true)

        if prices == nothing
            println("Price data not available")
            return defaultOutput
        end
        
        equity_value_wt = Vector{Float64}(length(allkeys))

        for (i, sym) in enumerate(allkeys)
            ticker = sym.ticker
            
            _temp_ts_close_non_nan = values(dropnan(prices[ticker], :any))
            _last_valid_close = length(_temp_ts_close_non_nan) > 0 ? _temp_ts_close_non_nan[end] : 0.0

            equity_value = portfolio.positions[sym].quantity * _last_valid_close
            equity_value_wt[i] = portfolio_value > 0.0 ? equity_value/portfolio_value : 0.0;
        end

        cash_wt = !excludeCash ? portfolio_value > 0.0 ? portfolio.cash/portfolio_value : 0.0 : 0.0

        composition = !excludeCash ? [Dict("weight" => cash_wt, "ticker" => "CASH_INR")] : []
        append!(composition, [Dict("weight" => equity_value_wt[i], "ticker" => tickers[i]) for i in 1:length(allkeys)])
        
        #BUG FIX: divide by number of positions
        concentration =  sqrt(sum(equity_value_wt.^2)/length(equity_value_wt))

        return (latest_date, composition, concentration)
    catch err
        rethrow(err)
    end
end

function _cashRequirement(oldPortfolio::Portfolio, newPortfolio::Portfolio, date::DateTime)

    newTickers = [sym.ticker for (sym, newPos) in newPortfolio.positions]
    oldTickers = [sym.ticker for (sym, oldPos) in oldPortfolio.positions]
    allTickers = unique(append!(newTickers, oldTickers))
    
    adjustments = YRead.getadjustments(allTickers, date, date)
    
    #Fetch price from date to 10 days + date (incase date doesn't have any prices)
    prices10DaysAhead = _getPricehistory(allTickers, date, date + Dates.Day(10), adjustment=false, appendRealtime=true, strict=false)
    
    #THIS IS ALITTLE HACKY CODE
    #BECAUSE WE DON"T HAVE DATA FOR today
    #WE WILL USE RT DATA
    ###THIS PIECE OF CODE IS USED TO CALCULATE CASH REQUIREMENT
    ###FOR CHANGES THAT HAPPENED TODAY
    prices = nothing
    if prices10DaysAhead == nothing
        if Date(now()) == Date(date)
            prices = _getPricehistory(allTickers, date, date, appendRealtime = true)
        end
    else 
        prices = TimeSeries.head(prices10DaysAhead, 1)
    end

    if prices == nothing
        return 0.0
    end
    
    cashRequirement = 0.0
    for ticker in allTickers
        symbol = getsecurity(ticker).symbol
        newQty = newPortfolio[symbol].quantity
        oldQty = oldPortfolio[symbol].quantity

        if haskey(adjustments, symbol.id)
            adjustmentForDates = adjustments[symbol.id]
            if haskey(adjustmentForDates, Date(date))
                adjustment = adjustmentForDates[Date(date)]
                adjType = adjustment[3]
                adjFactor = adjustment[2]
                if(adjType != 17.0)
                    oldQty = Int(round(oldQty*1.0/adjFactor))
                end
            end
        end

        priceTicker = dropnan(prices[ticker])
        cashRequirement += (newQty - oldQty) * (priceTicker !=nothing ? length(priceTicker) > 0 ? values(priceTicker)[end] : 0.0 : 0.0)    

    end

    return cashRequirement  
end    

#=
Compute portfolio value based on portfolio history for a given period
OUTPUT: Vector of portfolio value
=#
function compute_portfoliohistory_netvalue(portfolioHistory, cashAdjustment::Bool=false)
    
    try
        if portfolioHistory == nothing
           println("Portfolio history is empty")   
           return (nothing, nothing)
        end

        ts = Vector{TimeArray}(length(portfolioHistory))

        latest_portfolio_value_ta = nothing 
        portfolio_value_ta_adj = nothing
        portfolio_value_ta = nothing

        cash_adj_factor = 1.0
        cashFlow = 0.0 
        
        historyStartDate = length(portfolioHistory) > 0 ? DateTime(portfolioHistory[1]["startDate"], format) : DateTime() 
        historyEndDate = length(portfolioHistory) > 0 ? DateTime(portfolioHistory[end]["endDate"], format) : DateTime() 

        dividendFactor = 1.0
        hasDividendFactor = false

        #Adding Comment on 11/08/2018
        #Adding logic to appropriately compute cash generated by dividend
        #This is not reuiqred if dividend adjustment are 100% correct and applied every time
        #BUT we don't have data for split/dividends in RT,
        #So we will redo the cash accumulation over the history of the portfolio 
        #to get accurate portfolio.cash number as of NOW
        updatedPortfolioHistoryTuple = _updatePortfolioHistory_dividendCash(portfolioHistory)

        #Reversing the portfolio history because we want a portfolio to end
        #wih adjusted cash = 0
        reversePortfolioHistory = reverse(updatedPortfolioHistoryTuple)

        for (idx, tup) in enumerate(reversePortfolioHistory)

            #This is the ongoing adjusted NAV of ""FORWARD portfolio""
            latest_portfolio_value_ta_adj = portfolio_value_ta_adj  #NA

            #This is the true NAV of """FORWARD portfolio""" 
            latest_portfolio_value_ta = portfolio_value_ta   #ND

            portfolio = tup[1]
            startdate = tup[2]
            enddate = tup[3]

            # Compute portfolio value timed array
            # Output is TA 
            if enddate < startdate
                error("Start date in portfolio greater then End date. Can't compute portoflio value")    
            end

            #To compute backward adjusted NAV, let start in reverse
            portfolio_value_ta = _compute_portfoliovalue(portfolio, startdate, enddate) #, excludeCash=cashAdjustment)
            
            #THis is modified and dividendFactor is created only once
            # this is a departure from previous implementatin, so keep an eye
            if portfolio_value_ta != nothing && !hasDividendFactor
                dividendFactor*= (cashAdjustment ? (values(portfolio_value_ta)[end] - portfolio.cash)/values(portfolio_value_ta)[end] : 1.0)
                hasDividendFactor = true
            end
           
            #Logic to compute cash inflow (used primarily for advice)
            #Compute the portflio value of last portfolio at start date of next portfolio (ORGANIC GROWTH)
            #Compute the portfolio value of current portfolio at start date (CURRENT NAV)
            #CASH INFLOW = CURRENT NAV - ORGANIC GROWTH
            #Add the cash_inflow to last portfolio value... Adjusted Nav
            #Adjusted factor = Adjusted NAV/True Old Nav
            #Multiply the 
            if idx > 1 && cashAdjustment && 
                portfolio_value_ta != nothing && 
                latest_portfolio_value_ta != nothing &&
                latest_portfolio_value_ta_adj != nothing

                #NEXT because it is reversed in time
                next_tuple = reversePortfolioHistory[idx-1]
                next_portfolio = next_tuple[1]
                next_startdate = next_tuple[2]
                next_enddate = next_tuple[3]
                
                #fidn the true start date
                cashRequirement = _cashRequirement(portfolio, next_portfolio, next_startdate)

                #Historical portfolio's True NAV (this has no role in adjustment)
                #This is the ONE that is adjusted
                portfolio_NAV_today = values(portfolio_value_ta)[end]   #
                
                #Latest Portfolio's Adjusted NAV (TRUE in case of last portfolio in history)
                latest_portfolio_NAV_tomorrow_adj = values(latest_portfolio_value_ta_adj)[1]

                #Latest Portfolio's TRUE NAV
                latest_portfolio_NAV_tomorrow_unadj = values(latest_portfolio_value_ta)[1]
                

                ### THIS IS TRICKY...to use adj or _unadj (but should be the same???..FCUK)
                #on 16/05/2018
                #adj_factor = latest_portfolio_NAV_tomorrow_adj/(latest_portfolio_NAV_tomorrow_unadj - cashRequirement)

                #Modifying it to use unadjusted on 16/05/2018
                #Cumulative cash adjustment is reuiqred
                #NAV = [100 101 141] => 40 cash adjustment should go back all the way to history 141/(141-40) =  
                cash_adj_factor *= latest_portfolio_NAV_tomorrow_unadj/(latest_portfolio_NAV_tomorrow_unadj - cashRequirement)
                
                portfolio_value_ta_adj = portfolio_value_ta.*cash_adj_factor

            else 
                portfolio_value_ta_adj = portfolio_value_ta
            end

            if portfolio_value_ta_adj != nothing 
               portfolio_value_ta_adj = round.(portfolio_value_ta_adj.*dividendFactor, 2) 
               ts[length(portfolioHistory)-idx+1] = portfolio_value_ta_adj
            end

        end

        if length(ts) == 0
            println("Empty time series vector. No data available upstream")
            return (nothing, nothing)
        end

        f_ts = isassigned(ts, 1) ? ts[1] : nothing
            
        if length(ts) > 1
            for i = 2:length(ts)
                f_ts = f_ts != nothing && isassigned(ts, i) ? vcat(f_ts, ts[i]) : 
                    f_ts == nothing && isassigned(ts, i) ? ts[i] : f_ts
            end
        end

        if f_ts != nothing
            netValues = f_ts.values
            timeStamps = f_ts.timestamp
            return (netValues[:], timeStamps)
        else 
            return (nothing, nothing)
        end

    catch err
        rethrow(err)
    end
end

#=
Compute portfolio value for a given period (start and end date)
OUTPUT: Vector of portfolio value
=#
function compute_portfolio_value_period(port, startDate::DateTime, endDate::DateTime; excludeCash::Bool = false)
    try
        
        # the dates are string without sssZ format(JS)..not need to convert
        #startDate = DateTime(startDate[1:end-1])
        #endDate = DateTime(endDate[1:end-1])

        portfolio = convert(Raftaar.Portfolio, port)
        portfolio_value = _compute_portfoliovalue(portfolio, startDate, endDate, excludeCash = excludeCash, adjustment=true)

        return (portfolio_value.values, portfolio_value.timestamp)
    catch err
        rethrow(err)
    end
end

###
# Function to update portfolio with transactions
###
function updateportfolio_transactions(port::Dict{String, Any}, transactions::Vector{Dict{String,Any}})
    
    try

        portfolio = convert(Raftaar.Portfolio, port)
        cash = 0.0
        
        fills = Vector{OrderFill}()
        for transaction in transactions

            #Check if transaction is CASH
            if (transaction["security"]["ticker"] == "CASH_INR")  
                cash += convert(Float64, transaction["quantity"])
            else
                fill = convert(Raftaar.OrderFill, transaction)
                push!(fills, fill)
            end
        end

        if length(fills) > 0
            Raftaar.updateportfolio_fills!(portfolio, fills)
        end

        portfolio.cash += cash
        return portfolio
    catch err
        rethrow(err)
    end
end

###
# Function to update portfolio with latest price
###
function updateportfolio_price(port::Dict{String, Any}, end_date::DateTime = currentIndiaTime(), typ::String = "EOD")
    try
        portfolio = convert(Raftaar.Portfolio, port)    
        updateportfolio_price(portfolio, end_date, typ)
    catch err
        rethrow(err)
    end
end

###
# Function to update portfolio with latest price
###
function updateportfolio_price(portfolio::Portfolio, end_date::DateTime = currentIndiaTime(), typ::String = "EOD")
    try
        if (typ == "EOD")
            _updateportfolio_EODprice(portfolio, end_date)
        elseif (typ == "RT")
            _updateportfolio_RTprice(portfolio)
        end
        
    catch err
        rethrow(err)
    end
end

function updateportfolio_splitsAndDividends(portfolio::Dict{String,Any}, startdate::DateTime = currentIndiaTime(), enddate::DateTime = currentIndiaTime())
    port = convert(Raftaar.Portfolio, portfolio)
    output = Vector{Dict{String, Any}}()

    adjustmentsByDate = Dict{Date, Dict{SecuritySymbol, Adjustment}}()

    if (port == Portfolio())
        portfolio["startDate"] = startdate
        portfolio["endDate"] = enddate
        push!(output, portfolio)
        return output
    end

    # Fethch adjustments till date using YRead    
    secids = [sym.id for (sym, pos) in port.positions]
    adjustments = YRead.getadjustments(secids, startdate, enddate)

    for (secid, adjustments_security) in adjustments
        for (date, adjs) in adjustments_security
            if !haskey(adjustmentsByDate, date)
                adjustmentsByDate[date] = Dict{SecuritySymbol, Adjustment}()
            end

            sym = YRead.getsecurity(secid).symbol

            adjustmentsByDate[date][sym] = Raftaar.Adjustment(adjs[1], string(round(adjs[3])), adjs[2])
            
        end
    end

    for (date, adjustmentsAllSecurities) in sort(collect(adjustmentsByDate), by=x->x[1])
        
        #Update the portfolio with adjustments after the startdate
        if Date(date) > Date(startdate)
            portfolio = convert_to_node_portfolio(port)
            portfolio["startDate"] = startdate
            portfolio["endDate"] = DateTime(date) - Dates.Day(1)
            push!(output, portfolio)

            Raftaar.updateportfolio_splits_dividends!(port, adjustmentsAllSecurities)
            startdate = date
        end
    end

    portfolio = convert_to_node_portfolio(port)
    portfolio["startDate"] = startdate
    portfolio["endDate"] = enddate
    push!(output, portfolio)

    currentDate = Date(currentIndiaTime())

    # Check if today's adjustments are already handled in historical adjustments
    if Date(enddate) == currentDate && !haskey(adjustmentsByDate, currentDate)

        temp = convert_to_node_portfolio(port)
        temp["startDate"] = startdate
        temp["endDate"] = currentDate - Dates.Day(1)

        (updated_div, port) = _update_portfolio_dividends(port, enddate)
        (updated_splt, port) = _update_portfolio_splits(port, enddate)
        (updated_bns, port) = _update_portfolio_bonus(port, enddate)
        
        if (updated_div || updated_splt || updated_bns)
            if length(output) == 0 # No historical adjustments
                push!(output, temp)
            else #Historical adjustments are already present
                output[end]["endDate"] = currentDate - Dates.Day(1)
            end

            portfolio = convert_to_node_portfolio(port)

            portfolio["startDate"] = currentDate
            portfolio["endDate"] = DateTime("2200-01-01")

            push!(output, portfolio)

        end

    end

    return output
end    

###
# Function to compute portfolio WEIGHT composition for the LAST available day (in a period)
###
function compute_portfolio_metrics(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"); excludeCash::Bool = false)
    composition = nothing
    
    benchmark_ticker = "NIFTY_50"
    try
        (valid, benchmark_security) = _validate_security(benchmark)

        if !valid
            error("Invalid benchmark")
        else
            benchmark_ticker = benchmark["ticker"]
        end 
    catch err
        benchmark_ticker = "NIFTY_50"
    end

    #Fetch benchmark data for one year atleast
    #Hacky but hopefully this wil have some data
    edate = end_date
    sdate = DateTime(min(Date(start_date), Date(end_date) - Dates.Week(52)))
    prices_benchmark = history_nostrict([benchmark_ticker], "Close", :Day, sdate, edate)

    defaultOutput = excludeCash ? 
            (Date(currentIndiaTime()), Dict("composition" => [], "concentration" => 0.0)) :
            (Date(currentIndiaTime()), Dict("composition" => [Dict("weight" => 1.0, "ticker" => "CASH_INR")], "concentration" => 0.0))

    if prices_benchmark == nothing
        #Return the default output
        return defaultOutput

    elseif length(prices_benchmark.timestamp) > 0 

        #This can happen when start date of portfolio is today and EOD day for today is not yet available
        #In such a case, calculate composition of current portfolio as of last availale benchmark date (EOD date)        
        if prices_benchmark.timestamp[end] < Date(start_date)
            sdate = DateTime(prices_benchmark.timestamp[end])
            edate = DateTime(sdate)   
        end

        (date, composition, concentration) = _compute_portfolio_metrics(port, sdate, edate, excludeCash = excludeCash)

        return (date, Dict("composition" => composition != nothing ? composition : "", "concentration" => concentration))
    else 
        println("Empty data: Portfolio Composition can't be calculated")
        #Return the default output
        return defaultOutput
    end
end


###
# Function to compute averageprice of current holdings
# Used for advice portfolio (As advice portfolio doesn't have any transactions)
###
function updatePortfolio_averageprice(portfolioHistory::Vector{Dict{String, Any}})
    #n1,p1  n2,p2
    #Avg = [(n1P1 + (n2 - n1)*I(n2-n1 > 0)*P2]/max(n1,n2) 

    currentPortfolio = Raftaar.Portfolio()
    newPortfolio = Raftaar.Portfolio()

    for port in portfolioHistory
        newPortfolio = convert(Raftaar.Portfolio, port)
        newStartDate = haskey(port, "startDate") ? DateTime(port["startDate"], jsdateformat) : DateTime("2018-01-01")

        allkeys = keys(newPortfolio.positions)
        secids = [sym.id for sym in allkeys]

        #Get the Adjusted prices for tickers in the portfolio 
        #FIX: Expanding time period from today to start date (**else adjustment is not included)       
        
        prices = nothing  
        try
            prices = TimeSeries.head(YRead.history(secids, "Close", :Day, newStartDate, now(), displaylogs=false, forwardfill=true), 1)
        catch err
            warn("Price data for range not available while calculating average price!!")    
        end

        if prices == nothing
            println("Using last available price since $(newStartDate)")
            prices = YRead.history(secids, "Close", :Day, 1, newStartDate, displaylogs=false, forwardfill=true)
        end

        ####IMPROVEMENT: Use the latest prices when startDate is same as today's data
        useRtPrices = false #Flag to indicate whether to use EOD prices or RT prices
        #RtPrices are used during the middle of the day to compute averageprice (because EOD is not available yet)
        if Date(newStartDate) >= Date(currentIndiaTime()) && 
                prices.timestamp[end] != Date(newStartDate)
            useRtPrices = true         
        end

        allprices = Dict{SecuritySymbol, Float64}()
        for sym in allkeys
            allprices[sym] = useRtPrices && haskey(_realtimePrices, sym.ticker) ? get(_realtimePrices, sym.ticker, TradeBar()).close : 
                    prices!=nothing && sym.ticker in colnames(prices) ? values(prices[sym.ticker])[end] : 0.0
        end

        for sym in allkeys
            currentPosition = currentPortfolio[sym]
            newPosition = newPortfolio[sym]

            currentQty = currentPosition.quantity
            newQty = newPosition.quantity

            if (newQty > currentQty && currentQty > 0)
                diffQty = newQty - currentQty
                newPosition.averageprice = (currentPosition.averageprice*currentQty + diffQty*get(allprices, sym, 0.0))/newQty
            elseif (newQty <= currentQty && currentQty > 0)
                newPosition.averageprice = currentPosition.averageprice
            else   
                newPosition.averageprice = get(allprices, sym, 0.0)
            end
        
            newPortfolio[sym] = newPosition
        end

        currentPortfolio = newPortfolio
    end

    return now(), newPortfolio
    
end

function compute_fractional_ranking(vals::Dict{String, Float64}, scale::Float64)
    try
        ks = [k for (k,v) in vals]
        vs = [v for (k,v) in vals]
        
        ksWithNaN = ks[isnan.(vs)]
        ksWithoutNaN = ks[.!isnan.(vs)]
        vsWithoutNaN = vs[.!isnan.(vs)]

        fr = (tiedrank(vsWithoutNaN)-0.5)/length(vsWithoutNaN)

        if scale !=0.0
            mx = maximum(fr)
            mn = minimum(fr)
            
            scaleMax = scale
            scaleMin = 0.5

            #Logic to alter the scale
            mult = (scaleMax - scaleMin)/(mx-mn)
            shift = (mx*scaleMin -mn*scaleMax)/(mx-mn) 
            
            fr = fr*mult + shift
        end

        frDict = Dict{String, Float64}()
        
        for (i, k) in enumerate(ksWithoutNaN)
            frDict[k] = fr[i]
        end

        for (i, k) in enumerate(ksWithNaN)
            frDict[k] = 0.0
        end

        return frDict

    catch err
        rethrow(err)
    end
end

###
# Fucntion to search security in securites database
###
function findsecurities(hint::String, limit::Int, outputType::String) 
    try
        securities = YRead.getsecurities(hint, limit, outputType)

        if outputType == "count"
            return securities
        else
            securities_dict_format = []
            for security in securities
                push!(securities_dict_format, convert(Dict{String,Any}, security))
            end

            return securities_dict_format
        end    

    catch err
        println(err)
        rethrow(err)
    end
end
