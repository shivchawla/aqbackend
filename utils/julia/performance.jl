###
# Compute Portfolio Performance for a portfolio over a period (start and end dates)
# OUTPUT: Performance object
###
function compute_performance(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime)

    try 
        if start_date > end_date
            error("Start date is greater than End date. Can't compute performance")
        end

        portfolio = convert(Raftaar.Portfolio, port)

        cash = haskey(port, "cash") ? port["cash"] : 0.0

        cash = 0.0
        portfolio_value = _compute_portfoliovalue(portfolio, start_date, end_date, cash)

        benchmark = haskey(port, "benchmark") ? port["benchmark"]["ticker"] : "NIFTY_50"
        benchmark_value = history_nostrict([benchmark], "Close", :Day, start_date, end_date)
        
        if benchmark_value != nothing && portfolio_value != nothing
            merged_value = merge(portfolio_value, benchmark_value, :outer)
            merged_returns = percentchange(merged_value, :log)
            
            if length(merged_returns.timestamp) == 0
                return Performance()
            end

            portfolio_returns = merged_returns["Portfolio"].values
            benchmark_returns = merged_returns[benchmark].values

            # replace NaN with zeros
            portfolio_returns[isnan.(portfolio_returns)] = 0.0
            benchmark_returns[isnan.(benchmark_returns)] = 0.0

            performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
            performance.portfoliostats.netvalue = portfolio_value.values[end]
            
            return performance
        else
            return Performance()
        end
    catch err
        rethrow(err)
    end

end

###
# Compute Portfolio Performance based on NET-VALUE over a period (start and end dates)
# OUTPUT: Performance object
###
function compute_performance(portfolio_value::TimeArray, benchmark::String)


    ts = portfolio_value.timestamp
    if length(ts) < 2
        return Performance()
    end

    #Fetch benchmark price history
    start_date = ts[1]
    end_date = ts[end]
        
    portfolio_value = rename(portfolio_value, ["Portfolio"])
    benchmark_value = history_nostrict([benchmark], "Close", :Day, DateTime(start_date), DateTime(end_date))
    
    if portfolio_value != nothing && benchmark_value != nothing
        merged_value = merge(portfolio_value, benchmark_value, :outer)
        merged_returns = percentchange(merged_value, :log)
        
        if length(merged_returns.timestamp) == 0
            return Performance()
        end

        portfolio_returns = merged_returns["Portfolio"].values
        benchmark_returns = merged_returns[benchmark].values

        # replace NaN with zeros
        portfolio_returns[isnan.(portfolio_returns)] = 0.0
        benchmark_returns[isnan.(benchmark_returns)] = 0.0

        performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
        
        return performance
    else
        return Performance()
    end
end

###
# Function to compute (weighted)performance of individual stocks in portfolio   
###
function compute_performance_constituents(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"))
    
    try 

        if start_date > end_date
            error("Start date is greater than end date. Can't compute constituent performance.")
        end

        performance_allstocks = Dict{String, Any}[]
        
        all_securities = Raftaar.Security[]
        for pos in get(port, "positions", Vector{Dict{String,Any}}())
            (valid, security) = validate_security(pos["security"])
            if valid 
                push!(all_securities, security)
            end
        end

        (valid, benchmark_security) = validate_security(benchmark)

        all_tickers = [sec.symbol.ticker for sec in all_securities]
        stock_prices = YRead.history(all_tickers, "Close", :Day, start_date, end_date)
        benchmark_prices = history_nostrict([benchmark_security.symbol.ticker], "Close", :Day, start_date, end_date)

        if (stock_prices != nothing && benchmark_prices != nothing)
            merged_prices = merge(stock_prices, benchmark_prices, :outer)
            lastdate = merged_prices.timestamp[end] 
            performance_allstocks = [Dict("security" => serialize(security), 
                "stockPerformance" => compute_performance(merged_prices[security.symbol.ticker], benchmark_security.symbol.ticker)) for security in all_securities]
            return (merged_prices.timestamp[end], performance_allstocks)
        else
            return (Date(now()), [Dict("security" => serialize(security), 
                "stockPerformance" => Performance()) for security in all_securities])
        end
    catch err
        rethrow(err)
    end
    #performance_stock = JSON.parse(JSON.json(compute_stock_performance(security, start_date, end_date, benchmark)))
    #push!(performance_allstocks, Dict("security" => security, "performance" => performance_stock))
end

###
# Function to compute stock performance metrics over a period
###
function compute_stock_performance(security::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String, Any} = Dict("ticker"=>"NIFTY_50"))

    benchmark_ticker = "NIFTY_50"
    try
        (valid, benchmark_security) = validate_security(benchmark)
        if !validate_security
            error("Invalid Benchmark")
        else
            benchmark_ticker = benchmark["ticker"]
        end
    catch err
        benchmark_ticker = "NIFTY_50"
    end
    
    try
        if start_date > end_date
            error("Start date is greater than end date. Can't compute stock performance")
        end

        (valid, security) = validate_security(security)
        
        if valid
            benchmark_prices = history_nostrict([benchmark_ticker], "Close", :Day, start_date, end_date)
            stock_prices = YRead.history([security.symbol.ticker], "Close", :Day, start_date, end_date)
            
            if(benchmark_prices != nothing, stock_prices != nothing)
                
                merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
                
                ##Empty timeseries output of pctchange when length == 1 
                if length(merged_returns.timestamp) == 0
                    return (Date(now()), Performance())
                end

                merged_returns = rename(merged_returns, ["stock", "benchmark"])

                stock_returns = merged_returns["stock"].values
                benchmark_returns = merged_returns["benchmark"].values

                # replace NaN with zeros
                stock_returns[isnan.(stock_returns)] = 0.0
                benchmark_returns[isnan.(benchmark_returns)] = 0.0

                performance = Raftaar.calculateperformance(stock_returns, benchmark_returns)
        
                return (Date(merged_returns.timestamp[end]), performance)
            else
                return (Date(now()), Performance())
            end
        end
    catch err
        rethrow(err)    
    end
end

###
# Function to compute ROLLING stock performance metrics over complete history
###
function compute_stock_rolling_performance(security_dict::Dict{String,Any})

    try
        (valid, security) = validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = now()

            benchmark = "NIFTY_50"
            benchmark_prices = history_nostrict([benchmark], "Close", :Day, start_date, end_date)
            stock_prices = YRead.history([security.symbol.ticker], "Close", :Day, start_date, end_date)
            
            if benchmark_prices != nothing && stock_prices != nothing
                merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
                
                if length(merged_returns.timestamp) == 0
                    return Performance()
                end

                merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

                return Raftaar.calculateperformance_rollingperiods(merged_returns)
            else 
                return Performance()
            end
        else
            error("Stock data for $(security.securitysymbol.ticker) is not present")
        end
    catch err
        rethrow(err)
    end
end

###
# Function to compute STATIC stock performance metrics over complete history
###
function compute_stock_static_performance(security_dict::Dict{String,Any}; benchmark::String="NIFTY_50")
    try
        (valid, security) = validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = now()

            benchmark_prices = history_nostrict([benchmark], "Close", :Day, start_date, end_date)
            stock_prices = YRead.history([security.symbol.ticker], "Close", :Day, start_date, end_date)

            if benchmark_prices != nothing && stock_prices != nothing
                merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
                
                if length(merged_returns.timestamp) == 0
                    return Performance()
                end

                merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

                return Raftaar.calculateperformance_staticperiods(merged_returns)
            else
                return Performance()
            end
        else 
            error("Stock data for $(security.securitysymbol.ticker) is not present")    
        end
    catch err
       rethrow(err) 
    end
end

###
# Function to fetch PRICE HISTORY of a security
###
function get_stock_price_history(security_dict::Dict{String,Any})
    
    try
        (valid, security) = validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = now()

            stock_value = YRead.history([security.symbol.ticker], "Close", :Day, start_date, end_date)

            if stock_value != nothing
                (ts, prices) = (stock_value[security.symbol.ticker].timestamp, stock_value[security.symbol.ticker].values) 
                
                history = Vector{Dict{String, Any}}()
                for i = 1:length(ts)
                    push!(history, Dict{String, Any}("date" => Date(ts[i]), "price" => prices[i]))
                end
               
                return history
            else
                error("Stock data for $(security.securitysymbol.ticker) is not present")
            end
        end
    catch err
        rethrow(err)
    end    
end

###
# Function to fetch LATEST AVAIALBLE PRICE (and metrics) of a security
###
function get_stock_price_latest(security_dict::Dict{String,Any})
    
    try
        (valid, security) = validate_security(security_dict)
    
        if valid
            end_date = Date(now())
            start_date = end_date - Dates.Week(52)

            stock_value_52w = YRead.history(security.symbol.id, ["Open","High","Low","Close"], :Day, DateTime(start_date), DateTime(end_date))
            output = Dict{String, Any}() 

            if(length(stock_value_52w.values) > 0)
                
                highs = stock_value_52w["High"].values
                lows = stock_value_52w["Low"].values 
                
                output["High_52w"] = maximum(highs)
                output["Low_52w"] = minimum(lows)

                output["Low"] = stock_value_52w["Low"].values[end]
                output["High"] = stock_value_52w["High"].values[end]
                output["Open"] = stock_value_52w["Open"].values[end]
                output["Close"] = stock_value_52w["Close"].values[end]
                output["Date"] = string(Date(stock_value_52w.timestamp[end]))
                output["Change"] = length(stock_value_52w.timestamp) > 1 ? round(percentchange(stock_value_52w["Close"]).values[end] * 100.0, 2) : 0.0
            
                return output
            else
                error("Stock data for $(security.securitysymbol.ticker) is not present")
            end
        else 
            error("Stock data for $(security.securitysymbol.ticker) is not present")
        end
    catch err
        rethrow(err)
    end 
end

###
# Function to fetch PRICE HISTORY (without strict priority policy)
###
function history_nostrict(tickers, dtype::String, res::Symbol, sd::DateTime, ed::DateTime)
    #YRead.setstrict(false)
    data = YRead.history(tickers, dtype, res, sd, ed, strict = false)
    #YRead.setstrict(true)
    return data
end

