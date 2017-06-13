using YRead
using Raftaar: Security, Portfolio, Position, OrderFill
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
using Raftaar: updateportfolio_fill!

import Base: convert
using TimeSeries


function _get_security(security::Dict{String, Any})                
    
    ticker = haskey(security, "ticker") ? security["ticker"] : ""
    println(ticker)
    
    securitytype = haskey(security, "securitytype") ? security["securitytype"] : "EQ"
    println(securitytype)
    
    exchange = haskey(security, "exchange") ? security["exchange"] : "NSE"
    println(exchange)
    
    country = haskey(security, "country") ? security["country"] : "IN"
    println(country)
    
    # Fetch security from the database 
    return getsecurity(ticker, securitytype, exchange, country)

end

function convert(::Type{OrderFill}, transaction::Dict{String, Any})
    
    security = _get_security(transaction["security"])

    qty = haskey(transaction, "quantity") ? pos["quantity"] : 0
    price = haskey(transaction, "price") ? pos["price"] : 0.0
    fee = haskey(transaction, "fee") ? pos["fee"] : 0.0

    return OrderFill(security.symbol, price, qty, fee)

end

function convert(::Type{Portfolio}, port::Dict{String, Any})

    portfolio = Portfolio()

    if haskey(port, "positions")
        positions = port["positions"]

        for pos in positions
            if haskey(pos, "security")
                # Fetch security from the database 
                security = _get_security(pos["security"])

                println(security)
                println(security.symbol)
                
                qty = haskey(pos, "quantity") ? pos["quantity"] : 0
                price = haskey(pos, "price") ? pos["price"] : 0.0

                # Append to position dictionary
                portfolio.positions[security.symbol] = Position(security.symbol, qty, price, 0.0)
            end
        end
    end

    return portfolio
end




function _update_portfolio(portfolio::Portfolio, fill::OrderFill)

end

function _compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, cash::Float64)
    # Get the list of ticker
    secids = [sym.id for sym in keys(portfolio.positions)]    

    #get the unadjusted prices for tickers in the portfolio
    prices = YRead.history_unadj(secids, "close", :Day, start_date, end_date)

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

    println("asas")
    println(size(portfolio_value))
    println(size(ts))

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

        println(startDate)
        println(endDate)

        # Compute portfolio value timed array
        portfolio_value_ta = _compute_portfoliovalue(portfolio, startDate, endDate, cash)

        push!(ts, portfolio_value_ta)
    end

    f_ts = ts[1]

    for i = 2:length(ts)
        vcat(f_ts, ts)
    end

    return (f_ts.values, f_ts.timestamp)
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

