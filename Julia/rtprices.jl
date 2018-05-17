
const _realtimePrices = Dict{String, TradeBar}()
const _lastDayPrices = Dict{String, TradeBar}()
const _codeToTicker = readAllSecurities()

function _updateportfolio_EODprice(port::Portfolio, date::DateTime)
    
    updatedDate = currentIndiaTime()
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
                tradebars[sym] = haskey(_lastDayPrices, sym.ticker) ? 
                    [_lastDayPrices[sym.ticker]] :  
                    [Raftaar.TradeBar(latest_dt, 0.0, 0.0, 0.0, latest_values[sym.ticker].values[1])]
            end

            updatedDate = latest_dt
            Raftaar.updateportfolio_price!(port, tradebars, latest_dt)

        end
    end

    return (updatedDate, port)
end

function _updateportfolio_RTprice(port::Portfolio)
    
    updatedDate = currentIndiaTime()  
    alltickers = [sym.ticker for (sym, pos) in port.positions]
    #Check if portoflio has any non-zero number of stock positions
    ctAvailableTradebars = 0
    if length(alltickers) > 0
        tradebars = Dict{SecuritySymbol, Vector{TradeBar}}()
        for (sym, pos) in port.positions
            latest_tradebar = get(_realtimePrices, sym.ticker, TradeBar())
            
            if latest_tradebar == TradeBar() || latest_tradebar.close == 0.0
                println("Using EOD price for $(sym.ticker)")
                price = YRead.history([sym.id], "Close", :Day, 1, now())
                if price != nothing
                    val = values(price)[1]
                    latest_tradebar = Raftaar.TradeBar(DateTime(), val, val, val, val, 0)
                end
            end
            
            tradebars[sym] = [latest_tradebar]
        end

        Raftaar.updateportfolio_price!(port, tradebars, DateTime())

    end

    return (updatedDate, port)
end

function update_realtime_prices(fname::String, ftype::String)
    if ftype == "mkt"
        _update_realtime_mkt_prices(fname)
    else ftype == "ind"
        _update_realtime_ind_prices(fname)
    end
end

###
# Function to download and update realtime prices (from 15 minutes delayed feed)
function _update_realtime_mkt_prices(fname::String)
    try
       
        mktPrices = readMktFile(fname)
        
        @sync begin
        
            @async for (k,v) in mktPrices["RT"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    _realtimePrices[ticker] = v
                end
                
            end

            @async for (k,v) in mktPrices["EOD"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    _lastDayPrices[ticker] = v
                end

            end
        end

        return true
    catch err
        rethrow(err)
    end   
end

###
# Function to download and update realtime prices (from 15 minutes delayed feed)
function _update_realtime_ind_prices(fname::String)
    try
       
        indPrices = readIndFile(fname)
        
        @sync begin
        
            @async for (k,v) in indPrices["RT"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    _realtimePrices[ticker] = v
                end
                
            end

            @async for (k,v) in indPrices["EOD"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    _lastDayPrices[ticker] = v
                end

            end
        end

        return true
    catch err
        rethrow(err)
    end   
end
