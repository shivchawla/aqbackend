using YRead
using Raftaar: Security, SecuritySymbol, Portfolio, Position, OrderFill
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
using Raftaar: updateportfolio_fill!

import Base: convert
using TimeSeries


function convert(::Type{Security}, security::Dict{String, Any})                
    
    ticker = haskey(security, "ticker") ? security["ticker"] : ""
    securitytype = haskey(security, "securitytype") ? security["securitytype"] : "EQ"
    exchange = haskey(security, "exchange") ? security["exchange"] : "NSE"
    country = haskey(security, "country") ? security["country"] : "IN"
    # Fetch security from the database 
    YRead.getsecurity(ticker, securitytype = securitytype, exchange = exchange, country = country)

end

function convert(::Type{OrderFill}, transaction::Dict{String, Any})
    
    security = convert(Raftaar.Security, transaction["security"])

    qty = haskey(transaction, "quantity") ? convert(Int64,transaction["quantity"]) : 0
    price = haskey(transaction, "price") ? convert(Float64, transaction["price"]) : 0.0
    fee = haskey(transaction, "fee") ? convert(Float64,transaction["fee"]) : 0.0

    return OrderFill(security.symbol, price, qty, fee)

end

function convert(::Type{Portfolio}, port::Dict{String, Any})

    portfolio = Portfolio()

    if haskey(port, "positions")
        positions = port["positions"]

        for pos in positions
            if haskey(pos, "security")
                
                security = convert(Raftaar.Security, pos["security"])

                if security == Security()
                    println("Invalid security: $(security)")
                    return Portfolio()
                end  
            
                qty = haskey(pos, "quantity") ? pos["quantity"] : 0
                price = haskey(pos, "price") ? pos["price"] : 0.0

                # Append to position dictionary
                portfolio.positions[security.symbol] = Position(security.symbol, qty, price, 0.0)
                   
            end
        end
    end

    return portfolio
end

function _validate_advice(advice::Dict{String, Any})
    
    # Validate 3 components of portfolio
    #a. positions
    #b. start and end dates
    #c. benchmark

    if haskey(advice, "benchmark")
        benchmark = convert(Raftaar.Security, advice["benchmark"])
        
        if benchmark == Security()
            return false
        end
    else
        return false
    end

    if haskey(advice, "portfolio")
        return _validate_portfolio(advice["portfolio"]) 
    end 
    
    return true   
end 

function _validate_portfolio(port::Dict{String, Any})   
    startDate = DateTime()
    if haskey(port, "startDate")
        startDate = DateTime(port["startDate"])
    else
        return false    
    end

    endDate = DateTime()
    if haskey(port, "endDate")
        endDate = DateTime(port["endDate"])
    else
        return false    
    end

    if startDate >= endDate || startDate == DateTime() || endDate == DateTime()
        return false
    end

    portfolio = convert(Raftaar.Portfolio, port)
    
    if portfolio == Portfolio() 
        return false  
    end

    return true
end

function _update_portfolio(portfolio::Portfolio, fill::OrderFill)
end

function _compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, cash::Float64)
    # Get the list of ticker
    secids = [sym.id for sym in keys(portfolio.positions)]    

    #get the unadjusted prices for tickers in the portfolio
    prices = YRead.history_unadj(secids, "Close", :Day, start_date, end_date)

    ts = prices.timestamp

    nrows = length(ts)
    portfolio_value = zeros(nrows, 1)

    for (i, date) in enumerate(ts)

        equity_value = 0.0
        
        for (sym, pos) in portfolio.positions

            ticker = sym.ticker
            
            close = (prices[ticker][date]).values[1]
            equity_value += pos.quantity * close 
        end

        portfolio_value[i, 1] = equity_value + cash
    end

    return TimeArray(ts, portfolio_value, ["Portfolio"])
end

#=
Compute portfolio value on a given date
OUTPUT: portfolio value
=#
function _compute_portfoliovalue(port::Dict{String, Any}, date::DateTime)
    
    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0
    cash = convert(Float64, cash)

    portfolio_value = compute_portfoliovalue(portfolio, date, date, cash)

    return portfolio_value.values[1]
end

#=
Compute portfolio value based on portfolio history for a given period
OUTPUT: Vector of portfolio value
=#
function compute_portfolio_value_history(portfolioHistory)
    
    ts = Vector{TimeArray}()

    for collection in portfolioHistory

        port = collection["portfolio"]

        portfolio = convert(Raftaar.Portfolio, port)
        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)

        startDate = DateTime(collection["startDate"][1:end-1])
        endDate = DateTime(collection["endDate"][1:end-1])

        # Compute portfolio value timed array
        portfolio_value_ta = _compute_portfoliovalue(portfolio, startDate, endDate, cash)

        push!(ts, portfolio_value_ta)
    end

    f_ts = ts[1]

    for i = 2:length(ts)
        vcat(f_ts, ts)
    end

    netValues = f_ts.values
    timeStamps = f_ts.timestamp
    return (netValues[:], timeStamps)
end

#=
Compute portfolio value for a given period (start and end date)
OUTPUT: Vector of portfolio value
=#
function compute_portfolio_value_period(port, startDate, endDate)

    startDate = DateTime(startDate[1:end-1])
    endDate = DateTime(endDate[1:end-1])

    portfolio = convert(Raftaar.Portfolio, port)
    cash = haskey(port, "cash") ? port["cash"] : 0.0
    cash = convert(Float64, cash)

    portfolio_value = _compute_portfoliovalue(portfolio, startDate, endDate, cash)

    return (portfolio_value.values, portfolio_value.timestamp)
end

function compute_updated_portfolio(port::Dict{String, Any}, transactions::Vector{Any})
    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0
    cash = convert(Float64, cash)
    
    fills = Vector{OrderFill}()
    for transaction in transactions
        fill = convert(Raftaar.OrderFill, transaction)
        push!(fills, fill)
    end

    cash += Raftaar.updateportfolio_fills!(portfolio, fills)

    return (cash, portfolio)
end


function convert_to_node_portfolio(port::Portfolio)
    
    output = Dict{String, Any}("positions" => [])

    for (sym, pos) in port.positions
        n_pos = Dict{String, Any}()
        
        n_pos["security"] = serialize(getsecurity(pos.securitysymbol.id))
        n_pos["quantity"] = pos.quantity
        n_pos["price"] = pos.averageprice
        
        push!(output["positions"], n_pos) 
    end

    return output
end

