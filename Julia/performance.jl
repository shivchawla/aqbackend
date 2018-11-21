###
# Compute Portfolio Performance for a portfolio over a period (start and end dates)
# OUTPUT: 1. True Performance 
# 2. Tracked Performance(diff wrt benchmark)
# 3. Rolling Performance(rolling - mtd/ytd/1y etc)
###
function compute_performance(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime)

    try 
        if start_date > end_date
            error("Start date is greater than End date. Can't compute performance")
        end

        portfolio = convertPortfolio(port)

        cash = haskey(port, "cash") ? port["cash"] : 0.0

        cash = 0.0
        #Adding adjustment = true
        portfolio_value = _compute_portfoliovalue(portfolio, start_date, end_date, cash, adjustment=true)

        benchmark = haskey(port, "benchmark") ? port["benchmark"]["ticker"] : "NIFTY_50"
        benchmark_value = _getPricehistory([benchmark], start_date, end_date, strict=false, appendRealtime = true)
        
        if benchmark_value != nothing && portfolio_value != nothing
            #merge and drop observations before benchmark lastdate
            merged_value = filternan(to(merge(portfolio_value, benchmark_value, :outer), benchmark_value.timestamp[end]))
            
            if length(merged_value.timestamp) <= 1
                return (Date(currentIndiaTime()), 
                    Performance(), 
                    Performance(), 
                    Dict{String, Performance}(), 
                    Dict{String, Performance}(), 
                    Dict{String, Dict{String, Performance}}(), 
                    Dict{String, Performance}(), 
                    Dict{String, Dict{String, Performance}}())
            end

            merged_returns = percentchange(merged_value)
            
            portfolio_returns = merged_returns["Portfolio"].values
            benchmark_returns = merged_returns[benchmark].values

            dates = merged_returns.timestamp

            #Bug Fix: If the length is one, then there is only one day
            ndays = Int(Dates.value(merged_returns.timestamp[end] - merged_returns.timestamp[1])) + 1

            performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns, scale = 365, period = ndays)
            dperformance = Raftaar.calculateperformance(portfolio_returns - benchmark_returns, benchmark_returns, scale = 365, period = ndays)
            
            diff_returns_ts = merged_returns["Portfolio"] - merged_returns[benchmark]
            rollingperformance_diff = Raftaar.calculateperformance_rollingperiods(rename(merge(diff_returns_ts, merged_returns[benchmark]), ["algorithm", "benchmark"]))    

            rollingperformance = Raftaar.calculateperformance_rollingperiods(rename(merged_returns, ["algorithm", "benchmark"]))
            staticperformance = Raftaar.calculateperformance_staticperiods(rename(merged_returns, ["algorithm", "benchmark"]))
            
            onlybenchmark_returns = merge(TimeArray(dates, benchmark_returns, ["algorithm"]), TimeArray(dates, benchmark_returns, ["benchmark"]))
            rollingperformance_bench = Raftaar.calculateperformance_rollingperiods(onlybenchmark_returns)
            staticperformance_bench = Raftaar.calculateperformance_staticperiods(onlybenchmark_returns)
            
            performance.portfoliostats.netvalue = portfolio_value.values[end]
            
            return (merged_value.timestamp[end], 
                performance, 
                dperformance, 
                rollingperformance, 
                rollingperformance_diff, 
                staticperformance, 
                rollingperformance_bench, 
                staticperformance_bench)
        
        elseif benchmark_value != nothing
            return (benchmark_value.timestamp[end], 
                Performance(), 
                Performance(), 
                Dict{String, Performance}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}())
        
        else
            return (Date(currentIndiaTime()), 
                Performance(), 
                Performance(), 
                Dict{String, Performance}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}())
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

    #Fetch benchmark price history
    start_date = ts[1]
    end_date = ts[end]
        
    portfolio_value = rename(portfolio_value, ["Portfolio"])
    benchmark_value = _getPricehistory([benchmark], DateTime(start_date), DateTime(end_date), strict=false, appendRealtime = true)
    
    if portfolio_value != nothing && benchmark_value != nothing && length(ts) >= 2
        #merge and drop observations before benchmark lastdate
        merged_value = dropnan(to(merge(portfolio_value, benchmark_value, :outer), benchmark_value.timestamp[end]), :all)
        
        if length(merged_value.timestamp) <= 1
            return (Date(currentIndiaTime()), 
                Performance(), 
                Performance(), 
                Dict{String, Performance}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}(), 
                Dict{String, Performance}(), 
                Dict{String, Dict{String, Performance}}())
        end

        merged_returns = percentchange(merged_value)
        
        portfolio_returns = merged_returns["Portfolio"].values
        benchmark_returns = merged_returns[benchmark].values
        dates = merged_returns.timestamp

        ndays = Int(Dates.value(merged_returns.timestamp[end] - merged_returns.timestamp[1])) + 1

        performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns, scale = 365, period = ndays)
        
        dperformance = Raftaar.calculateperformance(portfolio_returns - benchmark_returns, benchmark_returns, scale = 365, period = ndays)
        
        diff_returns_ts = merged_returns["Portfolio"] - merged_returns[benchmark]
        rollingperformance_diff =  Raftaar.calculateperformance_rollingperiods(rename(merge(diff_returns_ts, merged_returns[benchmark]), ["algorithm", "benchmark"]))

        rollingperformance = Raftaar.calculateperformance_rollingperiods(rename(merged_returns, ["algorithm", "benchmark"]))
        staticperformance = Raftaar.calculateperformance_staticperiods(rename(merged_returns, ["algorithm", "benchmark"]))

        onlybenchmark_returns = merge(TimeArray(dates, benchmark_returns, ["algorithm"]), TimeArray(dates, benchmark_returns, ["benchmark"]))
        rollingperformance_bench = Raftaar.calculateperformance_rollingperiods(onlybenchmark_returns)
        staticperformance_bench = Raftaar.calculateperformance_staticperiods(onlybenchmark_returns)            

        return (merged_value.timestamp[end], 
            performance, 
            dperformance, 
            rollingperformance, 
            rollingperformance_diff, 
            staticperformance, 
            rollingperformance_bench, 
            staticperformance_bench)
    
    elseif benchmark_value != nothing
        return (benchmark_value.timestamp[end], 
            Performance(), 
            Performance(), 
            Dict{String, Performance}(), 
            Dict{String, Performance}(), 
            Dict{String, Dict{String, Performance}}(), 
            Dict{String, Performance}(), 
            Dict{String, Dict{String, Performance}}())

    else
        return (Date(currentIndiaTime()), 
            Performance(), 
            Performance(),
            Dict{String, Performance}(), 
            Dict{String, Performance}(), 
            Dict{String, Dict{String, Performance}}(), 
            Dict{String, Performance}(), 
            Dict{String, Dict{String, Performance}}())
    end
end

###
# Function to compute (weighted)performance of individual stocks in portfolio   
###
function compute_performance_constituents(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime, benchmark::Dict{String,Any} = Dict("ticker"=>"NIFTY_50"))
    
    try 
        #Why do we have check for end_date > currentIndiaTime()
        #Seems wrong- removing this check - 12/08/2018
        if start_date > end_date
            error("Invalid dates. Can't compute constituent performance.")
        end
        performance_allstocks = Dict{String, Any}[]
        
        port_raftaar = convertPortfolio(port)
        
        all_tickers = String[]
        for (sym, pos) in port_raftaar.positions
            push!(all_tickers, sym.ticker)
        end

        (valid, benchmark_security) = _validate_security(benchmark)
        edate = end_date
        sdate = DateTime(min(Date(start_date), Date(end_date) - Dates.Week(52)))
        benchmark_prices = _getPricehistory([benchmark_security.symbol.ticker], sdate, edate, strict=false, appendRealtime=true)

        if benchmark_prices == nothing
            return (Date(currentIndiaTime()), [merge(Dict("ticker" => ticker), empty_pnl()) for ticker in all_tickers])
        
        elseif benchmark_prices.timestamp[end] < Date(start_date)
            return (Date(currentIndiaTime()), [merge(Dict("ticker" => ticker), empty_pnl()) for ticker in all_tickers])

        elseif (benchmark_prices != nothing)
            benchmark_prices = dropnan(benchmark_prices, :any)
            (updatedDate, updatedPortfolio) = update_raftaarportfolio_price(port_raftaar, currentIndiaTime())
            
            performance_allstocks = [merge(Dict("ticker" => sym.ticker), compute_pnl_stats(updatedPortfolio, sym)) for (sym,pos) in updatedPortfolio.positions]
            
            return (Date(updatedDate), performance_allstocks)
        
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

    defaultOutput = (Date(currentIndiaTime()), Performance())

    benchmark_ticker = "NIFTY_50"
    try
        (valid, benchmark_security) = _validate_security(benchmark)
        if !valid
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

        (valid, security) = _validate_security(security)
        
        if valid
            benchmark_prices = _getPricehistory([benchmark_ticker], start_date, end_date, strict=false)
            
            stock_prices = nothing
            try
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, adjustment = true)
            catch err
                println("Error in fetching adjusted prices for $(security.symbol.ticker)")
            end

            if stock_prices == nothing
                println("Fetching un-adjusted prices for $(security.symbol.ticker)")
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, strict=false)
            end

            if(benchmark_prices != nothing && stock_prices != nothing)
                
                #calculate performance from start to end date of the stock prices
                sd = stock_prices.timestamp[end] 
                ed = min(benchmark_prices.timestamp[end], stock_prices.timestamp[end])

                #merge the prices with benchmark (include ts from benchmark)
                merged_prices_raw = from(to(merge(stock_prices, benchmark_prices, :right), ed), sd)
                merged_prices = merged_prices_raw != nothing ? dropnan(merged_prices_raw, :any) : nothing
                
                if merged_prices == nothing
                    return defaultOutput
                end

                merged_returns = percentchange(merged_prices)

                ##Empty timeseries output of pctchange when length == 1 
                if length(merged_returns.timestamp) == 0
                    return defaultOutput
                end

                merged_returns = rename(merged_returns, ["stock", "benchmark"])

                stock_returns = merged_returns["stock"].values
                benchmark_returns = merged_returns["benchmark"].values

                performance = Raftaar.calculateperformance(stock_returns, benchmark_returns, scale = 365, period = ndays)
        
                return (Date(merged_returns.timestamp[end]), performance)
            
            elseif benchmark_prices != nothing
                return (benchmark_prices.timestamp[end], Performance())

            else
                return defaultOutput
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

    defaultOutput = (Date(), Dict{String, Performance}())
    try
        (valid, security) = _validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = currentIndiaTime()

            benchmark = "NIFTY_50"
            benchmark_prices = _getPricehistory([benchmark], start_date, end_date, strict=false)
            
            stock_prices = nothing
            try
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, adjustment = true)
            catch err
                println("Error in fetching adjusted prices for $(security.symbol.ticker)")
            end

            if stock_prices == nothing
                println("Fetching un-adjusted prices for $(security.symbol.ticker)")
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, strict=false)
            end

            if benchmark_prices != nothing && stock_prices != nothing

                #calculate performance from start to end date of the stock prices
                sd = stock_prices.timestamp[1] 
                ed = min(benchmark_prices.timestamp[end], stock_prices.timestamp[end])

                merged_prices_raw = from(to(merge(stock_prices, benchmark_prices, :right), ed), sd)
                merged_prices = merged_prices_raw != nothing ? dropnan(merged_prices_raw, :any) : nothing
                
                if merged_prices == nothing
                    return defaultOutput
                end

                merged_returns = percentchange(merged_prices)
                if length(merged_returns.timestamp) == 0
                    return defaultOutput
                end

                merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

                return  (merged_prices.timestamp[end], Raftaar.calculateperformance_rollingperiods(merged_returns))
            
            else 
                return defaultOutput
            end
        else
            error("Stock data for $(security.symbol.ticker) is not present")
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
        (valid, security) = _validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = currentIndiaTime()

            benchmark_prices = _getPricehistory([benchmark], start_date, end_date, strict=false)
            
            stock_prices = nothing
            try
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, adjustment = true)
            catch err
                println("Error in fetching adjusted prices for $(security.symbol.ticker)")
            end

            if stock_prices == nothing
                println("Fetching un-adjusted prices for $(security.symbol.ticker)")
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, strict=false)
            end

            if benchmark_prices != nothing && stock_prices != nothing
                
                #calculate performance from start to end date of the stock prices
                sd = stock_prices.timestamp[1] 
                ed = min(benchmark_prices.timestamp[end], stock_prices.timestamp[end])

                merged_prices_raw = from(to(merge(stock_prices, benchmark_prices, :right), ed), sd)
                merged_prices = merged_prices_raw != nothing ? dropnan(merged_prices_raw, :any) : nothing
                
                if merged_prices == nothing
                    return defaultOutput
                end

                merged_returns = percentchange(merged_prices)
                
                if length(merged_returns.timestamp) == 0
                    return Performance()
                end

                merged_returns = rename(merged_returns, ["algorithm", "benchmark"])

                return Raftaar.calculateperformance_staticperiods(merged_returns)
            else
                return Performance()
            end
        else 
            error("Stock data for $(security.symbol.ticker) is not present")    
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
        (valid, security) = _validate_security(security_dict)
        
        if valid
            start_date = DateTime("2001-01-01")
            end_date = currentIndiaTime()

            stock_prices = nothing
            
            try
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, adjustment = true)
            catch err
                println("Error in fetching adjusted prices fot $(security.symbol.ticker)")
            end

            if stock_prices == nothing
                println("Fetching un-adjusted prices for $(security.symbol.ticker)")
                stock_prices = _getPricehistory([security.symbol.ticker], start_date, end_date, strict=false)
            end

            benchmark_prices = _getPricehistory(["NIFTY_50"], start_date, end_date, strict=false)
            
            if stock_prices != nothing && benchmark_prices != nothing
                stock_prices = dropnan(to(merge(stock_prices, benchmark_prices, :right), benchmark_prices.timestamp[end]), :any)

                (ts, prices) = (stock_prices[security.symbol.ticker].timestamp, stock_prices[security.symbol.ticker].values) 
                
                history = Vector{Dict{String, Any}}()
                for i = 1:length(ts)
                    push!(history, Dict{String, Any}("date" => Date(ts[i]), "price" => prices[i]))
                end
               
                return history
            else
                error("Stock data for $(security.symbol.ticker) is not present")
            end
        end
    catch err
        rethrow(err)
    end    
end

###
# Function to fetch historical snapshot for date
###
function get_stock_price_historical(security_dict::Dict{String,Any}, date:: DateTime)
    
    try
        (valid, security) = _validate_security(security_dict)
        
        if valid
            start_date = date - Dates.Day(10)
            end_date = date

            stock_prices = nothing
            
            ticker = security.symbol.ticker
            try
                stock_prices = _getPricehistory([ticker], start_date, end_date, adjustment = true)
            catch err
                println("Error in fetching adjusted prices fot $(security.symbol.ticker)")
            end

            if stock_prices == nothing
                println("Fetching un-adjusted prices for $(ticker)")
                stock_prices = _getPricehistory([ticker], start_date, end_date, strict=false)
            end

            benchmark_prices = _getPricehistory(["NIFTY_50"], start_date, end_date, strict=false)
            
            if stock_prices != nothing && benchmark_prices != nothing
                stock_prices = tail(dropnan(to(merge(stock_prices, benchmark_prices, :right), benchmark_prices.timestamp[end]), :any), 2)

                nDays = length(stock_prices)

                lastPrice = values(stock_prices[ticker])[1]
                closePrice = values(stock_prices[ticker])[end]

                change = 0
                changePct = 0

                if (nDays > 1) 
                    change = values(TimeSeries.diff(stock_prices[ticker]))[end]
                    changePct = lastPrice > 0 ? change/lastPrice : 0;
                end

                return Dict{String, Any}(
                    "Close" => closePrice,
                    "Change" => change,
                    "ChangePct" => changePct
                )

            else
                error("Stock data for $(security.symbol.ticker) is not present")
            end
        end
    catch err
        rethrow(err)
    end    
end

###
# Function to fetch LATEST AVAIALBLE PRICE (and metrics) of a security
###
function get_stock_price_latest(security_dict::Dict{String,Any}, ptype::String="EOD")
    
    try
        output = Dict{String, Any}() 
        
        if ptype == "EOD"
            (valid, security) = _validate_security(security_dict)
            
            if valid
            
                end_date = Date(currentIndiaTime())
                start_date = end_date - Dates.Week(52)

                stock_value_52w = nothing
                try
                    stock_value_52w = YRead.history(security.symbol.id, ["Open","High","Low","Close"], :Day, DateTime(start_date), DateTime(end_date), displaylogs=false)
                catch err
                    println("Error in fetching adjusted prices for $(security.symbol.ticker)")
                end

                if  stock_value_52w == nothing 
                    println("Fetching un-adjusted prices for $(security.symbol.ticker)")
                    stock_value_52w = history_nostrict(security.symbol.id, ["Open","High","Low","Close"], :Day, DateTime(start_date), DateTime(end_date))
                end

                if stock_value_52w == nothing 
                    error("Stock data for $(security.symbol.ticker) is not present")
                end

                if(length(values(stock_value_52w)) > 0)
                    
                    highs = values(stock_value_52w["High"])
                    lows = values(stock_value_52w["Low"])
                    
                    output["High_52w"] = maximum(highs)
                    output["Low_52w"] = minimum(lows)

                    output["Low"] = values(stock_value_52w["Low"])[end]
                    output["High"] = values(stock_value_52w["High"])[end]
                    output["Open"] = values(stock_value_52w["Open"])[end]
                    output["Close"] = values(stock_value_52w["Close"])[end]
                    output["Date"] = string(Date(stock_value_52w.timestamp[end]))
                    output["ChangePct"] = length(stock_value_52w.timestamp) > 1 ? round(percentchange(stock_value_52w["Close"]).values[end], 4) : 0.0
                    output["Change"] = length(stock_value_52w.timestamp) > 1 ? round(diff(stock_value_52w["Close"]).values[end], 2) : 0.0
                else
                    error("Stock data for $(security.symbol.ticker) is not present")
                end
            else 
                error("Stock data for $(security.symbol.ticker) is not present")
            end
        
        elseif ptype == "RT"
            ticker = replace(security_dict["ticker"], r"[^a-zA-Z0-9]", "_")
            tb_rt = get(_realtimePrices, ticker, TradeBar())
            tb_eod = get(_lastDayPrices, ticker, TradeBar())
            
            output["date"] = Date(tb_rt.datetime)

            #today's prices
            output["current"] = tb_rt.close
            output["low"] = tb_eod.low
            output["high"] = tb_eod.high
            output["open"] = tb_eod.open
            output["volume"] = tb_eod.volume

            #this is last day close            
            output["close"] = tb_eod.close
            
            output["change"] = round(output["current"] - output["close"], 2)
            output["changePct"] = round(output["close"] > 0 ? (output["current"] - output["close"])/output["close"] : 0.0, 4)
        end 

        return output     
        
    catch err
        println(err)
        rethrow(err)
    end 
end

function get_stock_realtime_price_historical(security_dict::Dict{String, Any}, fileNumber::Int, path::String)

    try
        output = Dict{String, Any}() 
   
        (realtimePrices, eodPrices) = get_realtime_prices("$path/$fileNumber.mkt", "mkt")

        ticker = replace(security_dict["ticker"], r"[^a-zA-Z0-9]", "_")
        tb_rt = get(realtimePrices, ticker, TradeBar())
        tb_eod = get(eodPrices, ticker, TradeBar())
        
        output["date"] = Date(tb_rt.datetime)

        #today's prices
        output["current"] = tb_rt.close
        output["low"] = tb_eod.low
        output["high"] = tb_eod.high
        output["open"] = tb_eod.open
        output["volume"] = tb_eod.volume

        #this is last day close            
        output["close"] = tb_eod.close
        
        output["change"] = round(output["current"] - output["close"], 2)
        output["changePct"] = round(output["close"] > 0 ? (output["current"] - output["close"])/output["close"] : 0.0, 4)

        return output
    catch err
        println(err)
        rethrow(err)
    end  
end

function get_stock_intraday_history(security::Security)
    #1. Read data from beginning to the current (if not available populate)
    #3. Keep min/max of each interval since the beginning
    #4. Return

    intradayPrices = get_intraday_prices(security.symbol.ticker)

    return Dict{String, Any}(
        "security" => convert(Dict{String,Any}, security),
        "history" => convert_to_node_tradebars(intradayPrices)
    )
end

function track_stock_intraday_detail(security::Security)
    
    return track_intraday_prices(security.symbol.ticker)
end


function untrack_stock_intraday_detail()
    
    return untrack_intraday_prices()
end


###
# Function to fetch PRICE HISTORY (without strict priority policy)
###
function history_nostrict(tickers, dtype::String, res::Symbol, sd::DateTime, ed::DateTime)
    data = YRead.history_unadj(tickers, dtype, res, sd, ed, strict = false, displaylogs=false)
    return data
end

function history_nostrict(ticker, dtypes::Vector{String}, res::Symbol, sd::DateTime, ed::DateTime)
    data = YRead.history_unadj(ticker, dtypes, res, sd, ed, strict = false, displaylogs=false)
    return data
end

function compute_pnl_stats(port, sym)
    pos = port[sym]
    pnl = pos.lastprice > 0.0 ? _getquantity(port, sym) * (pos.lastprice - pos.averageprice) : 0.0
    pnlpct = pos.averageprice > 0.0 ? round(100.0 * (pos.lastprice/pos.averageprice - 1.0), 2) : 0.0
    return Dict{String, Any}("pnl" => pnl, "pnl_pct" => pnlpct)
end

function empty_pnl()
    return Dict{String, Any}("pnl" => 0.0, "pnl_pct" => 0.0)
end

