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

function compute_portfoliovalue(portfolio::Portfolio, start_date::DateTime, end_date::DateTime, cash::Float64 = 0.0)
    # Get the list of ticker
    secids = [sym.id for sym in keys(portfolio.positions)]    

    #get the unadjusted prices for tickers in the portfolio
    prices = YRead.history_unadj(secids, "close", :Day, start_date, end_date)

    #get adjustments to portfolio over the period
    #adjs = getadjustments(secids, DateTime(start_date), DateTime(end_date))

    #secidToTicker = Dict{Int, String}()

    #=for pos in portfolio.positions
        securities[pos..symbol.id] = pos.security.symbol.ticker 
    end=#

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

    portfolio_value = compute_portfoliovalue(portfolio, date, date, cash)

    return portfolio_value.values[1]
end

function compute_performance(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime)

    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0

    portfolio_value = compute_portfoliovalue(portfolio, start_date, end_date, cash)

    benchmark = haskey(port, "benchmark") ? port["benchmark"] : "CNX_NIFTY"

    benchmark_value = history([benchmark], "Close", :Day, start_date, end_date)

    merged_value = merge(portfolio_value, benchmark_value, :outer)

    #println(merged_value)
    #println(merged_value["Portfolio"])
    #println(merged_value[benchmark])

    merged_returns = percentchange(merged_value, :log)
    
    #println("asasasas")
    #println(merged_returns)    

    portfolio_returns = merged_returns["Portfolio"].values
    benchmark_returns = merged_returns[benchmark].values

    # replace NaN with zeros
    portfolio_returns[isnan(portfolio_returns)] = 0.0
    benchmark_returns[isnan(benchmark_returns)] = 0.0

    #println(portfolio_returns)
    #println(benchmark_returns)

    performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
    
    #println(performance)
    performance.portfoliostats.netvalue = portfolio_value.values[end]
    
    return performance
end

function compute_performance(netvalue::Vector{Float64}, dates::Vector{DateTime}, benchmark::String = "CNX_NIFTY")


    if length(netvalue) < 5
        return Performance()
    end

    start_date = dates[1]
    end_date = dates[end]

    benchmark_value = history([benchmark], "Close", :Day, start_date, end_date)

    merged_value = merge(portfolio_value, benchmark_value, :outer)

    #println(merged_value)
    #println(merged_value["Portfolio"])
    #println(merged_value[benchmark])

    merged_returns = percentchange(merged_value, :log)
    
    #println("asasasas")
    #println(merged_returns)    

    portfolio_returns = merged_returns["Portfolio"].values
    benchmark_returns = merged_returns[benchmark].values

    # replace NaN with zeros
    portfolio_returns[isnan(portfolio_returns)] = 0.0
    benchmark_returns[isnan(benchmark_returns)] = 0.0

    #println(portfolio_returns)
    #println(benchmark_returns)

    performance = Raftaar.calculateperformance(portfolio_returns, benchmark_returns)
    
    #println(performance)

    return performance
end

