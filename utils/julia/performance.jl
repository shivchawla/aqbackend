#=
Compute Portfolio Performance for a portfolio over a period (start and end dates)
OUTPUT: performance
=#
function compute_performance(port::Dict{String, Any}, start_date::DateTime, end_date::DateTime)

    portfolio = convert(Raftaar.Portfolio, port)

    cash = haskey(port, "cash") ? port["cash"] : 0.0


    cash = 0.0
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

    benchmark_value = history([benchmark], "Close", :Day, DateTime(start_date), DateTime(end_date))

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


