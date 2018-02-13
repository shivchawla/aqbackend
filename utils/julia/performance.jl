###
# Compute Portfolio Performance for a portfolio over a period (start and end dates)
# OUTPUT: Performance object
###
function compute_performance(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime)

    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0

    cash = 0.0
    portfolio_value = _compute_portfoliovalue(portfolio, start_date, end_date, cash)

    benchmark = haskey(port, "benchmark") ? port["benchmark"]["ticker"] : "NIFTY_50"
    benchmark_value = history_nostrict([benchmark], "Close", :Day, start_date, end_date)
    merged_value = merge(portfolio_value, benchmark_value, :outer)
    merged_returns = percentchange(merged_value, :log)
    
    portfolio_returns = merged_returns["Portfolio"].values
    benchmark_returns = merged_returns[benchmark].values

    # replace NaN with zeros
    portfolio_returns[isnan.(portfolio_returns)] = 0.0
    benchmark_returns[isnan.(benchmark_returns)] = 0.0

    performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
    performance.portfoliostats.netvalue = portfolio_value.values[end]
    
    return performance
end

###
# Compute Portfolio Performance based on NET-VALUE over a period (start and end dates)
# OUTPUT: Performance object
###
function compute_performance(netvalue::Vector{Float64}, dates::Vector{Date}, benchmark::String)

    if length(netvalue) < 2
        return Performance()
    end

    start_date = dates[1]
    end_date = dates[end]

    vals = zeros(length(netvalue), 1)
    for (i,val) in enumerate(netvalue)
        vals[i,1] = val
    end

    portfolio_value = TimeArray(dates, vals, ["Portfolio"])
    benchmark_value = history_nostrict([benchmark], "Close", :Day, DateTime(start_date), DateTime(end_date))
    merged_value = merge(portfolio_value, benchmark_value, :outer)
    merged_returns = percentchange(merged_value, :log)
    
    portfolio_returns = merged_returns["Portfolio"].values
    benchmark_returns = merged_returns[benchmark].values

    # replace NaN with zeros
    portfolio_returns[isnan.(portfolio_returns)] = 0.0
    benchmark_returns[isnan.(benchmark_returns)] = 0.0

    performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
    
    return performance
end

###
# Function to compute (weighted)performance of individual stocks in portfolio   
###
function compute_performance_constituents(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"))
    performance_allstocks = Dict{String, Any}[]
    
    for pos in get(port, "positions", Vector{Dict{String,Any}}())
        security = pos["security"]
        performance_stock = JSON.parse(JSON.json(compute_stock_performance(security, start_date, end_date, benchmark)))
        push!(performance_allstocks, Dict("security" => security, "performance" => performance_stock))
    end

    return performance_allstocks
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
        (valid, security) = validate_security(security)
        
        if valid
            benchmark_prices = history_nostrict([benchmark_ticker], "Close", :Day, start_date, end_date)
            stock_prices = YRead.history([security.symbol.ticker], "Close", :Day, start_date, end_date)
            
            merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
            merged_returns = rename(merged_returns, ["stock", "benchmark"])

            stock_returns = merged_returns["stock"].values
            benchmark_returns = merged_returns["benchmark"].values

            # replace NaN with zeros
            stock_returns[isnan.(stock_returns)] = 0.0
            benchmark_returns[isnan.(benchmark_returns)] = 0.0


            performance = Raftaar.calculateperformance(stock_returns, benchmark_returns)
    
            return performance
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
            
            merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
            merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

            return Raftaar.calculateperformance_rollingperiods(merged_returns)
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

            merged_returns = percentchange(merge(stock_prices, benchmark_prices, :outer))
            merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

            return Raftaar.calculateperformance_staticperiods(merged_returns)
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
                output["Change"] = round(percentchange(stock_value_52w["Close"]).values[end] * 100.0, 2)
            
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

