
const _realtimePrices = Dict{String, TradeBar}()
const _lastDayPrices = Dict{String, TradeBar}()
const _codeToTicker = readSecurities()
const _codeToIndex = readIndices()
const _intradayPriceHistory = Dict{String, Vector{TradeBar}}()

const path = "/home/admin/rtdata"

function _updateportfolio_EODprice(port, date::DateTime)
    
    updatedDate = currentIndiaTime()
    alltickers = [sym.ticker for (sym, pos) in port.positions]
    #Check if portoflio has any non-zero number of stock positions

    if length(alltickers) > 0
        #fetch stock data and drop where all values are NaN
        stock_value_52w = YRead.history_unadj(alltickers, "Close", :Day, 1, date, displaylogs=false, forwardfill=true)

        #Check if stock values are valid 
        if stock_value_52w != nothing 
            #merge LEFT (that is if data is present in stock_values_52w)
            #merged_prices = filternan(to(merge(stock_value_52w, benchmark_value_52w, :left), benchmark_value_52w.timestamp[end]))
            merged_prices = stock_value_52w

            latest_values = merged_prices[end]
            latest_dt = DateTime(latest_values.timestamp[end])

            tradebars = Dict{SecuritySymbol, Vector{TradeBar}}()
            for (sym, pos) in port.positions
                tradebars[sym] = haskey(_lastDayPrices, sym.ticker) && _lastDayPrices[sym.ticker].datetime == date ? 
                    [_lastDayPrices[sym.ticker]] :  
                    [Raftaar.TradeBar(latest_dt, 0.0, 0.0, 0.0, latest_values[sym.ticker].values[1])]
            end

            updatedDate = latest_dt
            Raftaar.updateportfolio_price!(port, tradebars, latest_dt)

        end
    end

    return (updatedDate, port)
end

function _updateportfolio_RTprice(port)
    
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
                price = YRead.history([sym.id], "Close", :Day, 1, now(), displaylogs=false, forwardfill=true)
                if price != nothing
                    updatedDate = DateTime(price.timestamp[1])
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


function get_realtime_prices(fname::String, ftype::String)
    if ftype == "mkt"
        _get_realtime_mkt_prices(fname)
    else ftype == "ind"
        _get_realtime_ind_prices(fname)
    end
end

function track_intraday_prices(ticker)
    if !haskey(_intradayPriceHistory, ticker)
        _intradayPriceHistory[ticker] = get_intraday_prices(ticker)
    end

    return true
end

function untrack_intraday_prices()
    global _intradayPriceHistory = Dict{String, Vector{TradeBar}}()
end

function get_intraday_prices(ticker, date)

    if date == currentIndiaDate()
        if haskey(_intradayPriceHistory, ticker)
            return _intradayPriceHistory[ticker]
        else
            priceHistory = _get_intraday_prices(ticker)
            _intradayPriceHistory[ticker] = priceHistory
            return priceHistory 
        end
    else
        return _get_intraday_prices(ticker, date)
    end
end

function _get_intraday_prices(ticker, date=currentIndiaDate())
    
    priceHistory = Vector{TradeBar}()
    directory = "$path/$(Dates.format(date, "UddY"))"

    for i in 1:400
        file = "$directory/$i.mkt"
        try
            (realtimePrices, eodPrices) = _get_realtime_mkt_prices(file)

            if haskey(realtimePrices, ticker)
                tb = realtimePrices[ticker]

                idx = findfirst(x -> x.datetime == tb.datetime, priceHistory)
                if idx == 0
                    push!(priceHistory, tb)
                end
            end
        catch err
            continue
        end
    end

    return priceHistory
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

                if haskey(_intradayPriceHistory, ticker)
                    push!(_intradayPriceHistory[ticker], v)
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

function _get_realtime_mkt_prices(fname::String)
    try
       
        mktPrices = readMktFile(fname)
        realtimePrices = Dict{String, Any}()
        eodPrices = Dict{String, Any}()

        @sync begin
        
            @async for (k,v) in mktPrices["RT"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    realtimePrices[ticker] = v
                end
                
            end

            @async for (k,v) in mktPrices["EOD"]
                ticker = replace(get(_codeToTicker, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    eodPrices[ticker] = v
                end

            end
        end
            
        return (realtimePrices, eodPrices)
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
                ticker = replace(get(_codeToIndex, k, ""), r"[^a-zA-Z0-9]", "_")

                if ticker != ""
                    _realtimePrices[ticker] = v
                end
                
            end

            @async for (k,v) in indPrices["EOD"]
                ticker = replace(get(_codeToIndex, k, ""), r"[^a-zA-Z0-9]", "_")

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
