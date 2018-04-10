using YRead
using Raftaar: Security, SecuritySymbol, Portfolio, Position, OrderFill, TradeBar, Adjustment
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
using Raftaar: updateportfolio_fill!, updateportfolio_price!

import Base: convert
using TimeSeries
using StatsBase
using ZipFile

const _realtimePrices = Dict{SecuritySymbol, TradeBar}()
#const _codeToTicker = readSecurityFile("/Users/shivkumarchawla/Desktop/Securities.dat")

function filternan(ta::TimeArray, col = "")
    (nrows, ncols) = size(ta)
    lastname = col == "" ? colnames(ta)[ncols] : col
    ta[.!isnan.(ta[lastname].values)]
end    


function convert(::Type{Dict{String,Any}}, security::Security)                  
    try

        s = Dict{String, Any}()
        s["ticker"] = security.symbol.ticker
        s["exchange"] = security.exchange
        s["country"] = security.country
        s["securityType"] = security.securitytype
        s["name"] = security.name
        s["detail"] = security.detail != nothing ? security.detail : Dict{String, Any}()

        return s
    catch err
        rethrow(err)
    end
end

function convert(::Type{Security}, security::Dict{String, Any})                
    
    try
        ticker = uppercase(get(security, "ticker",""))
        securitytype = uppercase(get(security, "securitytype", "EQ"))
        exchange = uppercase(get(security, "exchange", "NSE"))
        country = uppercase(get(security, "country", "IN"))
        
        # Fetch security from the database 
        security = YRead.getsecurity(ticker, securitytype = securitytype, exchange = exchange, country = country)
                
    catch err
        rethrow(err)
    end
end

function convert(::Type{OrderFill}, transaction::Dict{String, Any})
 
    try
        security = convert(Raftaar.Security, transaction["security"])

        if security == Security() && transaction["security"]["ticker"] != "CASH_INR"
            error("Invalid transaction (Invalid Security: $(transaction["security"]["ticker"]))")
        end

        qty = convert(Int64, get(transaction, "quantity", 0))
        price = convert(Float64, get(transaction, "price", 0.0)) 
        fee = convert(Float64, get(transaction, "commission", 0.0))

        cashlinked = get(transaction, "cashLinked", false)
        
        return OrderFill(security.symbol, price, qty, fee, cashlinked)
    
    catch err
        rethrow(err)
    end
end

function convert(::Type{Portfolio}, port::Dict{String, Any})

    try
        portfolio = nothing

        if haskey(port, "positions")
            portfolio = Portfolio()

            positions = port["positions"]
            for pos in positions
                if haskey(pos, "security")
                    
                    security = convert(Raftaar.Security, pos["security"])
                    
                    if security == Security()
                        if pos["security"]["ticker"] == "CASH_INR" 
                            portfolio.cash += convert(Float64, get(pos, "quantity", 0.0))
                            continue
                        else
                            error("Invalid portfolio composition (Invalid Security: $(pos["security"]["ticker"]))")
                        end
                    end

                    qty = get(pos, "quantity", 0)
                    
                    #MODIFY the logic to fetch the close price for the date if
                    #price is 0.0 
                    price = convert(Float64, get(pos, "avgPrice", 0.0))

                    lastprice = convert(Float64, get(pos, "lastPrice", 0.0))                    

                    #Link the position to an advice (Used in marketplace Sub-Portfolio)
                    advice = get(pos, "advice", "")

                    #Added check if advice is populated (from node)
                    if typeof(advice) == Dict{String,Any}
                        advice = get(advice, "_id", "")    
                    end

                    advice = advice == nothing ? "" : advice

                    pos = Position(security.symbol, qty, price, advice)

                    pos.lastprice = lastprice
                    # Append to position dictionary
                    portfolio.positions[security.symbol] = pos
                       
                end
            end
        else
            error("Positions key is missing")
        end

        if haskey(port, "cash")
            cash = convert(Float64, port["cash"])
            portfolio.cash += cash
        end

        return portfolio        

    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Validate advice (portfolio and notional limits)
###
function _validate_advice(advice::Dict{String, Any}, lastAdvice::Dict{String, Any}, strictNetValue)
    
    # Validate 3 components of portfolio
    #a. positions
    #b. start and end dates
    #c. benchmark
    try

        portfolio = get(advice, "portfolio", Dict{String, Any}())
        oldPortfolio = get(lastAdvice, "portfolio", Dict{String, Any}())
        
        if portfolio == Dict{String, Any}()
            error("Advice doesn't contain portfolio")
        end

        #If portfolio has benchmark
        if haskey(portfolio, "benchmark") 
            benchmark = convert(Raftaar.Security, portfolio["benchmark"])
             
            if haskey(oldPortfolio, "benchmark")
                benchmark_old = convert(Raftaar.Security, oldPortfolio["benchmark"])
                if benchmark != benchmark_old
                    error("Benchmark change is not valid for active advice")
                end
            end

            if benchmark == Security()
                error("Invalid Benchmark Security")
            end
        else
            error("Advice doesn't contain benchmark Security")
        end

        portfolioDetail = get(portfolio, "detail", Dict{String, Any}())
        oldPortfolioDetail = get(oldPortfolio, "detail", Dict{String, Any}())
       
        #Validate dates
        #=format = "yyyy-mm-ddTHH:MM:SS.sssZ"
        startDate = haskey(portfolioDetail, "startDate") ? DateTime(portfolioDetail["startDate"], format) : DateTime()
        endDate = haskey(portfolioDetail, "endDate") ? DateTime(portfolioDetail["endDate"], format) : DateTime()
        if startDate >= endDate || startDate == DateTime() || endDate == DateTime()
            error("Empty dates or startDate less than or equal to end date")
        end

        #Check for old advice if oldAdvice is not empty
        oldPortfolioDetail = get(oldPortfolio, "detail", Dict{String, Any}())
        lastStartDate = haskey(oldPortfolioDetail, "startDate") ? DateTime(oldPortfolioDetail["startDate"], format) : DateTime()
        lastEndDate = haskey(oldPortfolioDetail, "endDate") ? DateTime(oldPortfolioDetail["endDate"], format) : DateTime()

        if lastStartDate != DateTime() && lastEndDate != DateTime() && startDate <= lastEndDate 
            error("Empty dates or startDate less than or equal to end date of current advice")
        end=#

        startDate = haskey(portfolioDetail, "startDate") ? DateTime(portfolioDetail["startDate"]) : Date()
        if startDate <= DateTime(Date(now()))
            error("Startdate of new advice: $(startDate) can't be today or before today")
        end

        oldStartDate = haskey(oldPortfolioDetail, "startDate") ? DateTime(oldPortfolioDetail["startDate"]) : Date()
        if (startDate <= oldStartDate) 
            error("Startdate of new advice: $(startDate) can't be same or before Startdate of current Advice: $(oldStartDate)")
        end
        
        #Validating positions and benchmark
        (valid_port, port) = _validate_portfolio(portfolio, checkbenchmark = false)

        if !valid_port
            return valid_port
        end

        #ADD CHECK FOR ZERO PRICES (OR PRICES DIFFERENT FROM CLOSE ON THE DATE)

        portval = _compute_latest_portfoliovalue(port)

        maxnotional = get(advice, "maxNotional", 1000000.0)

        if portval == nothing
            error("Can't compute portfolio prices | missing prices")
        elseif portval > 1.05 * maxnotional && strictNetValue #Allow 5% 
            error("Portfolio value exceeds inital:$(maxnotional) + 5% bound")
        else
            return true
        end
    catch err
        rethrow(err)
    end
end 

function _validate_adviceportfolio(advicePortfolio::Dict{String, Any}, lastAdvicePortfolio::Dict{String, Any})
    
    try
        format = "yyyy-mm-ddTHH:MM:SS.sssZ"
        
        startDate = haskey(advicePortfolio, "startDate") ? DateTime(advicePortfolio["startDate"], format) : DateTime()
        endDate = haskey(advicePortfolio, "endDate") ? DateTime(advicePortfolio["endDate"], format) : DateTime()

        lastStartDate = haskey(lastAdvicePortfolio, "startDate") ? DateTime(lastAdvicePortfolio["startDate"], format) : DateTime()
        lastEndDate = haskey(lastAdvicePortfolio, "endDate") ? DateTime(lastAdvicePortfolio["endDate"], format) : DateTime()

        if startDate >= endDate || startDate == DateTime() || endDate == DateTime()
            return false
        end

        if lastStartDate != DateTime() && lastEndDate != DateTime() && startDate <= lastEndDate 
            return false
        end

        if haskey(advicePortfolio, "portfolio")
            return _validate_portfolio(advicePortfolio["portfolio"]) 
        end 
        
        return false  
    catch err
        rethrow(err)
    end 
end 

###
# Function to validate a security (against database data)
###
function _validate_security(security::Dict{String, Any})
    
    try
        security_raftaar = convert(Raftaar.Security, security)
        if security_raftaar == Security()
            error("Invalid Security")
        end

        return (true, security_raftaar)
    catch err
        rethrow(err)
    end
end

function _validate_transactions(transactions::Vector{Dict{String,Any}}, advicePort::Dict{String, Any}, investorPort::Dict{String, Any})
    try
        if advicePort != Dict{String,Any}()
            effInvPortfolio = Portfolio()
            
            #Update investor portfolio with advice transactions
            #get effective investor portfolio
            if investorPort != Dict{String, Any}()
                (cash, effInvPortfolio) = updateportfolio_transactions(investorPort, transactions)
            else
                (cash, effInvPortfolio) = updateportfolio_transactions(Dict("positions" => []), transactions);
            end

            #=transactions_raftaar = Raftaar.OrderFill[];

            for (i, transaction) in enumerate(transactions)
                try
                    push!(transactions_raftaar, convert(Raftaar.OrderFill, transaction))
                    #Can add a check by comparing the price...but not important 
                catch err
                    rethrow(err)
                end
            end=#
        
            advPortfolio = convert(Raftaar.Portfolio, advicePort)
            multiple = Int64[]

            if length(keys(advPortfolio.positions)) != length(keys(effInvPortfolio.positions))
                return false
            end
            
            for sym in keys(advPortfolio.positions)
                
                #sym = txn.securitysymbol
                posAdvice = get(advPortfolio.positions, sym, nothing)
                posInvestor = get(effInvPortfolio.positions, sym, nothing)

                if(posAdvice == nothing || posInvestor == nothing)
                    error("Transaction in Invalid Position: $(sym.ticker)")
                end

                remainder = posInvestor.quantity % posAdvice.quantity
                
                if(abs(remainder) > 0)
                    error("Invalid quantity in $(sym.ticker)")
                end

                push!(multiple, round(posInvestor.quantity / posAdvice.quantity))

            end

            #check if all are equal
            return all(y->y==multiple[1], multiple)
        else
            return true
        end

    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Validate portfolio for positions (and internal stocks)
###
function _validate_portfolio(port::Dict{String, Any}; checkbenchmark = true)   
    try 
        portfolio = nothing
        if haskey(port, "detail")
            portfolio = convert(Raftaar.Portfolio, port["detail"])
        else
            error("Empty portfolio")
        end 
        
        benchmark = get(port, "benchmark", nothing)

        if checkbenchmark
            if benchmark == nothing
                error("Benchmark is not present")
            end

            benchmark = convert(Raftaar.Security, port["benchmark"])
            
            if benchmark == Security()
                error("Invalid benchmark security")
            end
        end
        
        return (true, portfolio)
    catch err
        rethrow(err)
    end
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
        prices = YRead.history_unadj(secids, "Close", :Day, 1, now(), offset = -1, displaylogs=false)

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
function _compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, typ::String="Adj")
    try
        # Get the list of ticker
        secids = [sym.id for sym in keys(portfolio.positions)]    

        prices = nothing
        
        if typ == "Adj" 
            #Get the Adjusted prices for tickers in the portfolio
            prices = YRead.history(secids, "Close", :Day, start_date, end_date, displaylogs=false)
        elseif typ == "UnAdj"
            #Get the Adjusted prices for tickers in the portfolio
            prices = YRead.history_unadj(secids, "Close", :Day, start_date, end_date, displaylogs=false)
        end

        #Using benchmark prices to filter out days when benchmark is not available
        #Remove benchmark prices where it's NaN
        #This is imortant becuse Qaundl/XNSE has data for holidays as well
        benchmark_prices = history_nostrict(["NIFTY_50"], "Close", :Day, start_date, end_date)
        merged_prices = nothing

        if prices != nothing && benchmark_prices != nothing
            merged_prices = filternan(to(from(merge(prices, benchmark_prices, :right), Date(start_date)), Date(end_date)))
        end

        if merged_prices == nothing
            println("Price data not available")
            dt_array = Date(start_date):Date(end_date)
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

            portfolio_value[i, 1] = equity_value + portfolio.cash
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
function _compute_portfolio_metrics(port::Dict{String, Any}, sdate::DateTime, edate::DateTime)
    try
        
        portfolio = convert(Raftaar.Portfolio, port)

        portfolio_values = dropnan(_compute_portfoliovalue(portfolio, sdate, edate), :any)

        if portfolio_values == nothing || length(portfolio_values) == 0 
            return ([Dict("weight" => 1.0, "ticker" => "CASH_INR")], 0.0)
        end

        portfolio_value = values(portfolio_values)[end]
        latest_date = DateTime(portfolio_values.timestamp[end])

        # Get the list of ticker
        allkeys = keys(portfolio.positions)
        secids = [sym.id for sym in allkeys]
        tickers = [sym.ticker for sym in allkeys]    

        #Get the Adjusted prices for tickers in the portfolio
        prices = YRead.history(secids, "Close", :Day, sdate, edate, displaylogs=false)

        if prices == nothing
            println("Price data not available")
            return (DateTime(), [Dict("weight" => 1.0, "ticker" => "CASH_INR")], 0.0)
        end
        
        equity_value_wt = Vector{Float64}(length(allkeys))

        for (i, sym) in enumerate(allkeys)
            ticker = sym.ticker
            
            _temp_ts_close_non_nan = values(dropnan(prices[ticker], :any))
            _last_valid_close = length(_temp_ts_close_non_nan) > 0 ? _temp_ts_close_non_nan[end] : 0.0

            equity_value = portfolio.positions[sym].quantity * _last_valid_close
            equity_value_wt[i] = portfolio_value > 0.0 ? equity_value/portfolio_value : 0.0;
        end

        cash_wt = portfolio_value > 0.0 ? portfolio.cash/portfolio_value : 0.0

        composition = [Dict("weight" => cash_wt, "ticker" => "CASH_INR")]
        append!(composition, [Dict("weight" => equity_value_wt[i], "ticker" => tickers[i]) for i in 1:length(allkeys)])
        
        concentration =  sqrt(sum(equity_value_wt.^2))

        return (latest_date, composition, concentration)
    catch err
        rethrow(err)
    end
end

function _updateportfolio_EODprice(port::Portfolio, date::DateTime)
    
    updated = false
    updatedDate = now()

    alltickers = [sym.ticker for (sym, pos) in port.positions]
    #Check if portoflio has any non-zero number of stock positions
    if length(alltickers) > 0
        start_date = DateTime(Date(date) - Dates.Week(52))
        end_date = date

        #fetch stock data and drop where all values are NaN
        stock_value_52w = dropnan(YRead.history_unadj(alltickers, "Close", :Day, start_date, end_date, displaylogs=false), :all)
        benchmark_value_52w =  history_nostrict(["NIFTY_50"], "Close", :Day, start_date, end_date) 

        #Check if stock values are valid 
        if stock_value_52w != nothing && benchmark_value_52w != nothing
            #merge LEFT (that is if data is present in stock_values_52w)
            merged_prices = filternan(to(merge(stock_value_52w, benchmark_value_52w, :left), benchmark_value_52w.timestamp[end]))
            
            latest_values = merged_prices[end]
            latest_dt = DateTime(latest_values.timestamp[end])

            tradebars = Dict{SecuritySymbol, Vector{TradeBar}}()
            for (sym, pos) in port.positions
                tradebars[sym] = [Raftaar.TradeBar(latest_dt, 0.0, 0.0, 0.0, latest_values[sym.ticker].values[1])]
            end

            updatedDate = latest_dt
            Raftaar.updateportfolio_price!(port, tradebars, latest_dt)
        end
    end

    return (updated, updatedDate, port)
end

function _updateportfolio_RTprice(port::Portfolio)
    
    updated = false
    updatedDate = now()  
    alltickers = [sym.ticker for (sym, pos) in port.positions]
    #Check if portoflio has any non-zero number of stock positions
    if length(alltickers) > 0

        tradebars = Dict{SecuritySymbol, Vector{TradeBar}}()
        for (sym, pos) in port.positions
            latest_tradebar = get(_realtimePrices, sym, TradeBar())
            #tradebars[sym] = [Raftaar.TradeBar(latest_dt, 0.0, 0.0, 0.0, latest_prices["close"])]
            tradebars[sym] = [latest_tradebar]
        end

        updated = true 
        Raftaar.updateportfolio_price!(port, tradebars, DateTime())
    end

    return (updated, updatedDate, port)
end

function _download_realtime_prices()
    source_dir = Base.source_dir()
    try
        zip_data=source_dir*"/rtdata/zip_data"
        token = "MX4zkypoSjUzp8CyotQg"
        download("https://www.quandl.com/api/v3/databases/XNSE/data?auth_token=$(token)&download_type=partial", zip_data)

        fname = ""
        r = ZipFile.Reader(zip_data)
        fdir=source_dir*"/rtdata/"

        if length(r.files) > 0
            f = r.files[1]
            println("Extracting file")
            fname = f.name
            if !isfile(fdir*fname)
                writedlm(fdir*fname, readdlm(f))
            else
                println("File already exists. Skipping extraction")
            end
        end

        #Delete the downloaded file
        println("Deleting the downloaded zip file")
        rm(zip_data)

        return fname
    catch err
        rethrow(err)
    end  
end

function _read_realtime_prices(file::String)
    try 
        file_fullpath = Base.source_dir()*"/rtdata/$(file)"
        if (file == "" || !isfile(file_fullpath)) 
            println("Invalid RT file")
            return 
        end

        dlm_data = readdlm(file_fullpath, ',', Any)
        (nrows,ncols) = size(dlm_data)
        if nrows > 0
            for i = 1:nrows
                # Convert ticker to string(in case ticker is a number)
                ticker = String(dlm_data[i,1])
                if length(ticker[search(ticker, "UADJ")]) != 0
                    continue
                end
                security = YRead.getsecurity(ticker)
                if security == Security()
                    continue
                end
                open = dlm_data[i,3]
                high = dlm_data[i,4]
                low = dlm_data[i,5]
                close = dlm_data[i,6]
                volume = dlm_data[i,7]
                tradebar = TradeBar(DateTime(), open, high, low, close, volume)
                
                #update the global variable
                _realtimePrices[security.symbol] = tradebar 
            end
        end
    catch err
       rethrow(err)
    end
end

function _get_dividends(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/dividends.csv", header=true)

    dividends = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        fv = convert(Float64, data[row, find(headers.=="fv")[1]])
        pct = convert(Float64, data[row, find(headers.=="percentage")[1]])*0.01
        fdate = Date(data[row, find(headers.=="date")[1]])

        if Date(fdate) == Date(date)
            dividends[security.symbol] = fv*pct
        end

    end

    return dividends
end

function _get_splits(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/splits.csv", header=true)

    splits = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        ofv = convert(Float64, data[row, find(headers.=="ofv")[1]])
        nfv = convert(Float64, data[row, find(headers.=="nfv")[1]])
        fdate = Date(data[row, find(headers.=="date")[1]])

        if Date(fdate) == Date(date)
            splits[security.symbol] = ofv > 0.0 ? nfv/ofv : 1.0
        end

    end

    return splits
end

function _get_bonus(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/bonus.csv", header=true)

    bonus = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        ratio = data[row, find(headers.=="ratio")[1]]
        fdate = Date(data[row, find(headers.=="date")[1]])

        n = parse(split(ratio,':')[1])
        d = parse(split(ratio,':')[2])

        if Date(fdate) == Date(date)
            bonus[security.symbol] = d/(n+d)
        end

    end

    return bonus
end

function _update_portfolio_dividends(port::Portfolio, date::DateTime = now())
    dividends = _get_dividends(date)
    cashgen = 0.0
    updated = false
    for (sym,dividend) in dividends
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            cashgen += pos.quantity * dividend
            pos.lastprice = pos.lastprice > 0 ? pos.lastprice - dividend : 0.0
        end
    end

    port.cash += cashgen

    return (updated, port)
end

function _update_portfolio_splits(port::Portfolio, date::DateTime = now())
    splits = _get_splits(date)

    updated = false
    for (sym, splt) in splits
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            pos.quantity = Int(round(pos.quantity * 1.0/splt, 0))
            pos.lastprice = pos.lastprice * splt
            pos.averageprice = pos.averageprice * splt
        end
    end

    return (updated, port)
end

function _update_portfolio_bonus(port::Portfolio, date::DateTime = now())
    bonus = _get_bonus(date)

    updated = false
    for (sym, bns) in bonus
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            pos.quantity = Int(round(pos.quantity * 1.0/bns, 0))
            pos.lastprice = pos.lastprice * bns
            pos.averageprice = pos.averageprice * bns
        end
    end

    return (updated, port)
end

###
# Function to download and update realtime prices (from 15 minutes delayed feed)
function update_realtime_prices()
    try
        #First download prices
        #function to fetch data from NSE rt servers
        #1. save the file 
        #latest_file = _download_realtime_prices()
        
        #2. Load the data in _readTimePrices
        #_read_realtime_prices("XNSE_20180323.partial.csv")

        mktPrices = readMktFile("/Users/shivkumarchawla/Desktop/DelayedSnapshotCM30_02022018/35.mkt")
        
        for (k,v) in mktPrices
            ticker = get(_codeToTicker, k, "")

            if ticker != ""        
                security = YRead.getsecurity(ticker)
                _realtimePrices[security.symbol] = v
            end
        end

        return true
    catch err
        rethrow(err)
    end   
end

#=
Compute portfolio value based on portfolio history for a given period
OUTPUT: Vector of portfolio value
=#
function compute_portfoliohistory_netvalue(portfolioHistory)
    
    try
        ts = Vector{TimeArray}()

        format = "yyyy-mm-ddTHH:MM:SS.sssZ"
      
        for collection in portfolioHistory

            port = collection["portfolio"]

            portfolio = convert(Raftaar.Portfolio, port)

            startDate = DateTime(collection["startDate"], format)
            endDate = DateTime(collection["endDate"], format)

            # Compute portfolio value timed array
            # Output is TA 
            if endDate < startDate
                error("Start date in portfolio greater then End date. Can't compute portoflio value")    
            end

            portfolio_value_ta = _compute_portfoliovalue(portfolio, startDate, endDate, "UnAdj")

            if portfolio_value_ta != nothing 
                push!(ts, portfolio_value_ta)
            end
        end

        if length(ts) == 0
            println("Empty time series vector. No data available upstream")
            return (nothing, nothing)
        end
        
        f_ts = ts[1]

        for i = 2:length(ts)
            f_ts = vcat(f_ts, ts[i])
        end

        netValues = f_ts.values
        timeStamps = f_ts.timestamp
        return (netValues[:], timeStamps)
    catch err
        rethrow(err)
    end
end

#=
Compute portfolio value for a given period (start and end date)
OUTPUT: Vector of portfolio value
=#
function compute_portfolio_value_period(port, startDate::DateTime, endDate::DateTime)
    try
        
        # the dates are string without sssZ format(JS)..not need to convert
        #startDate = DateTime(startDate[1:end-1])
        #endDate = DateTime(endDate[1:end-1])

        portfolio = convert(Raftaar.Portfolio, port)
        portfolio_value = _compute_portfoliovalue(portfolio, startDate, endDate)

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
function updateportfolio_price(port::Dict{String, Any}, end_date::DateTime = now(), typ::String = "EOD")
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
function updateportfolio_price(portfolio::Portfolio, end_date::DateTime = now(), typ::String = "EOD")
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


function updatedportfolio_splits_dividends(portfolio::Dict{String,Any}, date::DateTime = now())
    port = convert(Raftaar.Portfolio, portfolio)
    
    (updated_div, port) = _update_portfolio_dividends(port, date)
    (updated_splt, port) = _update_portfolio_splits(port, date)
    (updated_bns, port) = _update_portfolio_bonus(port, date)
    
    return (updated_div || updated_splt || updated_bns, port)
end    

###
# Function to compute portfolio WEIGHT composition for the LAST available day (in a period)
###
function compute_portfolio_metrics(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"))
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

    if prices_benchmark == nothing
        #Return the default output
        return (Date(now()), Dict("composition" => [Dict("weight" => 1.0, "ticker" => "CASH_INR")], "concentration" => 0.0))

    elseif prices_benchmark.timestamp[end] < Date(start_date)
        return (Date(now()), Dict("composition" => [Dict("weight" => 1.0, "ticker" => "CASH_INR")], "concentration" => 0.0))

    elseif length(prices_benchmark.timestamp) > 0 
        #date = prices_benchmark.timestamp[end]
        (date, composition, concentration) = _compute_portfolio_metrics(port, sdate, edate)

        return (date, Dict("composition" => composition != nothing ? composition : "", "concentration" => concentration))
    else 
        println("Empty data: Portfolio Composition can't be calculated")
        #Return the default output
        return (Date(now()), Dict("composition" => [Dict("weight" => 1.0, "ticker" => "CASH_INR")], "concentration" => 0.0))
    end
end

function convert_to_node_portfolio(port::Portfolio)
    try
        output = Dict{String, Any}("positions" => [], "cash" => port.cash)

        for (sym, pos) in port.positions
            n_pos = Dict{String, Any}()
            
            n_pos["security"] = convert(Dict{String,Any}, getsecurity(pos.securitysymbol.id))
            n_pos["quantity"] = pos.quantity
            n_pos["avgPrice"] = pos.averageprice
            n_pos["unrealizedPnL"] = pos.lasttradepnl
            n_pos["lastPrice"] = pos.lastprice
            n_pos["advice"] = pos.advice == "" ? nothing : pos.advice

            push!(output["positions"], n_pos) 
        end

        return output
    catch err
        rethrow(err)
    end
end

function compute_fractional_ranking(vals::Dict{String, Float64}, scale::Float64)
    try
        ks = [k for (k,v) in vals]
        vs = [v for (k,v) in vals]
        
        ksWithNaN = ks[isnan.(vs)]
        ksWithoutNaN = ks[!isnan.(vs)]
        vsWithoutNaN = vs[!isnan.(vs)]

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
