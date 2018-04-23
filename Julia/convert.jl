
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
                    dividendcash = convert(Float64, get(pos, "dividendCash", 0.0))

                    pos = Position(security.symbol, qty, price, advice, dividendcash)

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
            n_pos["dividendCash"] = pos.dividendcash

            push!(output["positions"], n_pos) 
        end

        return output
    catch err
        rethrow(err)
    end
end
