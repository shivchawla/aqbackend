using YRead
using Raftaar: Security, SecuritySymbol, Portfolio, Position, OrderFill
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
using Raftaar: updateportfolio_fill!

import Base: convert
using TimeSeries

function convert(::Type{Dict{String,Any}}, security::Security)                  
    try
        s = Dict{String, Any}()
        s["ticker"] = security.symbol.ticker
        s["exchange"] = security.exchange
        s["country"] = security.country
        s["securityType"] = security.securitytype

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
                        error("Invalid portfolio composition (Invalid Security: $(pos["security"]["ticker"]))")
                    end

                    qty = get(pos, "quantity", 0)
                    
                    #MODIFY the logic to fetch the close price for the date if
                    #price is 0.0 
                    price = get(pos, "price", 0.0)
                    price = convert(Float64, price)

                    # Append to position dictionary
                    portfolio.positions[security.symbol] = Position(security.symbol, qty, price, 0.0)
                       
                end
            end
        else
            error("Positions key is missing")
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
function _validate_advice(advice::Dict{String, Any}, lastAdvice::Dict{String, Any})
    
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

        portfoliodetail = get(portfolio, "detail", Dict{String, Any}())
       
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
            
        #Validating positions and benchmark
        (valid_port, port) = _validate_portfolio(portfolio, checkbenchmark = false)

        if !valid_port
            return valid_port
        end

        portval = _compute_latest_portfoliovalue(port, convert(Float64, get(portfoliodetail,"cash", 0.0)))

        maxnotional = convert(Float64, parse(get(advice, "maxNotional", "0.0")))

        if portval == nothing
            error("Can't compute portfolio prices | missing prices")
        elseif portval > 1.1 * maxnotional #Allow 10% 
            error("Portfolio value exceeds maxnotional:$(maxnotional) + 10% bound")
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
function _compute_latest_portfoliovalue(portfolio::Portfolio, cash::Float64)
   
    try
        # Get the list of ticker
        secids = [sym.id for sym in keys(portfolio.positions)]    

        #get the unadjusted prices for tickers in the portfolio
        prices = YRead.history_unadj(secids, "Close", :Day, 1, now(), offset = -1)

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
            
            close = values(prices[ticker])[end]
            equity_value += pos.quantity * close 
        end

        portfolio_value = equity_value + cash 
    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Compute portfolio value over a period
# OUTPUT: portfolio value vector
###
function _compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, cash::Float64)
    try
        # Get the list of ticker
        secids = [sym.id for sym in keys(portfolio.positions)]    

        #Get the Adjusted prices for tickers in the portfolio
        prices = YRead.history(secids, "Close", :Day, start_date, end_date)

        if prices == nothing
            println("Price data not available")
            return cash
        end

        ts = prices.timestamp

        nrows = length(ts)
        portfolio_value = zeros(nrows, 1)

        for (i, date) in enumerate(ts)

            equity_value = 0.0
            
            for (sym, pos) in portfolio.positions

                ticker = sym.ticker
                
                close = (prices[ticker][date]).values[1]
                equity_value += pos.quantity * (!isnan(close) ? close : 0.0)
            end

            portfolio_value[i, 1] = equity_value + cash
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

        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)

        portfolio_value = _compute_portfoliovalue(portfolio, date, date, cash)

        return portfolio_value.values[1]
    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Function to compute portfolio compostion on a specific date
###
function _compute_portfolio_composition(port::Dict{String, Any}, date::DateTime)
    try
        portfolio = convert(Raftaar.Portfolio, port)

        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)

        portfolio_value = _compute_portfoliovalue(portfolio, date, date, cash).values[1]

        # Get the list of ticker
        allkeys = keys(portfolio.positions)
        secids = [sym.id for sym in allkeys]
        tickers = [sym.ticker for sym in allkeys]    

        #Get the Adjusted prices for tickers in the portfolio
        prices = YRead.history(secids, "Close", :Day, date, date)

        if prices == nothing
            println("Price data not available")
            return nothing
        end
        
        equity_value_wt = Vector{Float64}(length(allkeys))

        for (i, sym) in enumerate(allkeys)
            ticker = sym.ticker
            close = (prices[ticker]).values[1]
            equity_value = portfolio.positions[sym].quantity * close
            equity_value_wt[i] = portfolio_value > 0.0 ? equity_value/portfolio_value : 0.0;
        end

        cash_wt = portfolio_value > 0.0 ? cash/portfolio_value : 0.0

        composition = [Dict("weight" => cash_wt, "ticker" => "CASH_INR")]
        append!(composition, [Dict("weight" => equity_value_wt[i], "ticker" => tickers[i]) for i in 1:length(allkeys)])
        
        return composition
    catch err
        rethrow(err)
    end
end

###
# Function to validate a security (against database data)
###
function validate_security(security::Dict{String, Any})
    
    try
        security_raftaar = convert(Raftaar.Security, security)
        if security_raftaar == Security()
            error("Inavlid Security")
        end

        return (true, security_raftaar)
    catch err
        rethrow(err)
    end
end

#=
Compute portfolio value based on portfolio history for a given period
OUTPUT: Vector of portfolio value
=#
function compute_portfolio_value_history(portfolioHistory)
    
    try
        ts = Vector{TimeArray}()

        format = "yyyy-mm-ddTHH:MM:SS.sssZ"
      
        for collection in portfolioHistory

            port = collection["portfolio"]

            portfolio = convert(Raftaar.Portfolio, port)
            cash = haskey(port, "cash") ? port["cash"] : 0.0
            cash = convert(Float64, cash)

            startDate = DateTime(collection["startDate"], format)
            endDate = DateTime(collection["endDate"], format)

            # Compute portfolio value timed array
            portfolio_value_ta = _compute_portfoliovalue(portfolio, startDate, endDate, cash)

            if portfolio_value_ta != nothing    
                push!(ts, portfolio_value_ta)
            end
        end

        if length(ts) == 0
            println("Empty timer series vector. No data available upstream")
            return (nothing, nothing)
        end
        
        f_ts = ts[1]

        for i = 2:length(ts)
            vcat(f_ts, ts)
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
        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)

        portfolio_value = _compute_portfoliovalue(portfolio, startDate, endDate, cash)

        return (portfolio_value.values, portfolio_value.timestamp)
    catch err
        rethrow(err)
    end
end

###
# Function to update portfolio with transactions
###
function compute_updated_portfolio(port::Dict{String, Any}, transactions::Vector{Any})
    try
        portfolio = convert(Raftaar.Portfolio, port)

        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)
        
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
            nd = Raftaar.updateportfolio_fills!(portfolio, fills)
            println("Cash from fills: $(nd)")
            cash += nd
        end

        return (cash, portfolio)
    catch err
        rethrow(err)
    end
end

###
# Function to compute portfolio WEIGHT composition for the LAST available day (in a period)
###
function compute_portfolio_composition(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"))
    composition_alldates = Dict{String, Any}()
    
    benchmark_ticker = "NIFTY_50"
    try
        (valid, benchmark_security) = validate_security(benchmark)

        if !valid
            error("Invalid benchmark")
        else
            benchmark_ticker = benchmark["ticker"]
        end 
    catch err
        benchmark_ticker = "NIFTY_50"
    end

    prices_benchmark = history_nostrict([benchmark_ticker], "Close", :Day, start_date, end_date)

    ts = prices_benchmark.timestamp

    if length(ts) > 0 
        date = ts[end]

        println("Computing composition for date: $(date)")

        #for date in prices_benchmark.timestamp[end]
        composition = _compute_portfolio_composition(port, DateTime(date))
        composition_alldates[string(Date(date))] = composition != nothing ? composition : ""
    end

    return composition_alldates
end

function convert_to_node_portfolio(port::Portfolio)
    try
        output = Dict{String, Any}("positions" => [])

        for (sym, pos) in port.positions
            n_pos = Dict{String, Any}()
            
            n_pos["security"] = convert(Dict{String,Any}, getsecurity(pos.securitysymbol.id))
            n_pos["quantity"] = pos.quantity
            n_pos["price"] = pos.averageprice
            
            push!(output["positions"], n_pos) 
        end

        return output
    catch err
        rethrow(err)
    end
end


