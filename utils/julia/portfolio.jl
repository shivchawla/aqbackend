using YRead
using Raftaar: Security, Portfolio, Position
using Raftaar: Performance, PortfolioStats 
using Raftaar: calculateperformance
import Base: convert
using TimeSeries


function convert(::Type{Portfolio}, port::Dict{String, Any})

    portfolio = Portfolio()

    if haskey(port, "positions")
        positions = port["positions"]

        for pos in positions
            if haskey(pos, "security")
                println(pos)
                sec = pos["security"]
                
                ticker = haskey(sec, "ticker") ? sec["ticker"] : ""
                println(ticker)
                securitytype = haskey(sec, "securitytype") ? sec["securitytype"] : "EQ"
                println(securitytype)
                exchange = haskey(sec, "exchange") ? sec["exchange"] : "NSE"
                println(exchange)
                country = haskey(sec, "country") ? sec["country"] : "IN"
                println(country)
                # Fetch security from the database 
                security = getsecurity(ticker, securitytype, exchange, country)

                qty = haskey(pos, "quantity") ? pos["quantity"] : 0
                price = haskey(pos, "price") ? pos["price"] : 0.0

                println(security)
                println(security.symbol)
                
                # Append to position dictionary
                portfolio.positions[security.symbol] = Position(security.symbol, qty, price, 0.0)
            end
        end
    end

    return portfolio
end

function compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, cash::Float64)
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

function compute_portfoliovalue(port::Dict{String, Any}, date::DateTime)
    
    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0
    cash = convert(Float64, cash)

    portfolio_value = compute_portfoliovalue(portfolio, date, date, cash)

    return portfolio_value.values[1]
end

function compute_portfolio_value_history(collections)
    
    ts = Vector{TimeArray}()

    for collection in collections

        port = collection["portfolio"]

        portfolio = convert(Raftaar.Portfolio, port)
        cash = haskey(port, "cash") ? port["cash"] : 0.0
        cash = convert(Float64, cash)

        startDate = DateTime(collection["startDate"][1:end-1])
        endDate = DateTime(collection["endDate"][1:end-1])

        println(startDate)
        println(endDate)

        portfolio_value = compute_portfoliovalue(portfolio, startDate, endDate, cash)

        push!(ts, portfolio_value)
    end

    f_ts = ts[1]

    for i = 2:length(ts)
        vcat(f_ts, ts)
    end

    return (f_ts.values, f_ts.timestamp)
end

function compute_portfolio_value_period(port, startDate, endDate)

    startDate = DateTime(startDate[1:end-1])
    endDate = DateTime(endDate[1:end-1])

    portfolio = convert(Raftaar.Portfolio, port)
    cash = haskey(port, "cash") ? port["cash"] : 0.0
    cash = convert(Float64, cash)

    portfolio_value = compute_portfoliovalue(portfolio, startDate, endDate, cash)

    return (portfolio_value.values, portfolio_value.timestamp)
end

