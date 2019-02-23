###
# Internal Function
# Validate advice (portfolio and notional limits)
###
function _validate_advice(advice::Dict{String, Any}, lastAdvice::Dict{String, Any})
    
    jsFormat = "yyyy-mm-ddTHH:MM:SS.sssZ"
    # Validate 3 components of portfolio
    #a. positions
    #b. start and end dates
    #c. benchmark
    try

        portfolio = get(advice, "portfolio", Dict{String, Any}())
        oldPortfolio = get(lastAdvice, "portfolio", Dict{String, Any}())
        
        if portfolio == Dict{String, Any}()
            error("Advice doesn't contain portfolio")
        end

        #If portfolio has benchmark
        if haskey(portfolio, "benchmark") 
            benchmark = convert(BackTester.Security, portfolio["benchmark"])
             
            if haskey(oldPortfolio, "benchmark")
                benchmark_old = convert(BackTester.Security, oldPortfolio["benchmark"])
                if benchmark != benchmark_old
                    error("Benchmark change is not valid for active advice")
                end
            end

            if benchmark == Security()
                error("Invalid Benchmark Security")
            end
        else
            error("Advice doesn't contain benchmark Security")
        end

        portfolioDetail = get(portfolio, "detail", Dict{String, Any}())
        oldPortfolioDetail = get(oldPortfolio, "detail", Dict{String, Any}())
       
        #Validating positions and benchmark
        (valid_port, port) = _validate_portfolio(portfolio, checkbenchmark = false)

        return valid_port
        
    catch err
        rethrow(err)
    end
end 

#NOT IN USE
function _validate_adviceportfolio(advicePortfolio::Dict{String, Any}, lastAdvicePortfolio::Dict{String, Any})
    
    try
        format = "yyyy-mm-ddTHH:MM:SS.sssZ"
        
        startDate = haskey(advicePortfolio, "startDate") ? DateTime(advicePortfolio["startDate"], format) : DateTime(1)
        endDate = haskey(advicePortfolio, "endDate") ? DateTime(advicePortfolio["endDate"], format) : DateTime(1)

        lastStartDate = haskey(lastAdvicePortfolio, "startDate") ? DateTime(lastAdvicePortfolio["startDate"], format) : DateTime(1)
        lastEndDate = haskey(lastAdvicePortfolio, "endDate") ? DateTime(lastAdvicePortfolio["endDate"], format) : DateTime(1)

        if startDate >= endDate || startDate == DateTime(1) || endDate == DateTime(1)
            return false
        end

        if lastStartDate != DateTime(1) && lastEndDate != DateTime(1) && startDate <= lastEndDate 
            return false
        end

        if haskey(advicePortfolio, "portfolio")
            return _validate_portfolio(advicePortfolio["portfolio"]) 
        end 
        
        return false  
    catch err
        rethrow(err)
    end 
end 

function _validate_contest_entry(entry::Dict{String, Any}, lastEntry::Dict{String, Any}; dollarPosition::Bool=false)
    
    jsFormat = "yyyy-mm-ddTHH:MM:SS.sssZ"
    # Validate 3 components of portfolio
    #a. positions
    #b. start and end dates
    #c. benchmark
    try

        portfolio = get(entry, "portfolio", Dict{String, Any}())
        oldPortfolio = get(lastEntry, "portfolio", Dict{String, Any}())
        
        if portfolio == Dict{String, Any}()
            error("Advice doesn't contain portfolio")
        end

        #If portfolio has benchmark
        if haskey(portfolio, "benchmark") 
            benchmark = convert(BackTester.Security, portfolio["benchmark"])
             
            if haskey(oldPortfolio, "benchmark")
                benchmark_old = convert(BackTester.Security, oldPortfolio["benchmark"])
                if benchmark != benchmark_old
                    error("Benchmark change is not valid for active advice")
                end
            end

            if benchmark == Security()
                error("Invalid Benchmark Security")
            end
        else
            error("Advice doesn't contain benchmark Security")
        end

        portfolioDetail = get(portfolio, "detail", Dict{String, Any}())
        oldPortfolioDetail = get(oldPortfolio, "detail", Dict{String, Any}())
       
        #Validating positions and benchmark
        (valid_port, port) = _validate_portfolio(portfolio, checkbenchmark = false, dollarposition=true)

        return valid_port
        
    catch err
        rethrow(err)
    end
end 

###
# Function to validate a security (against database data)
###
function _validate_security(security::Dict{String, Any})
    
    try
        security_raftaar = convert(BackTester.Security, security)
        if security_raftaar == Security()
            error("Invalid Security")
        end

        return (true, security_raftaar)
    catch err
        rethrow(err)
    end
end

function _validate_transactions(transactions::Vector{Dict{String,Any}}, advicePort::Dict{String, Any}, investorPort::Dict{String, Any})
    try
        if advicePort != Dict{String,Any}()
            effInvPortfolio = Portfolio()
            
            #Update investor portfolio with advice transactions
            #get effective investor portfolio
            if investorPort != Dict{String, Any}()
                effInvPortfolio = updateportfolio_transactions(investorPort, transactions)
            else
                effInvPortfolio = updateportfolio_transactions(Dict("positions" => []), transactions);
            end

            #=transactions_raftaar = BackTester.OrderFill[];

            for (i, transaction) in enumerate(transactions)
                try
                    push!(transactions_raftaar, convert(BackTester.OrderFill, transaction))
                    #Can add a check by comparing the price...but not important 
                catch err
                    rethrow(err)
                end
            end=#
            
            advPortfolio = convert(BackTester.Portfolio, advicePort)
            multiple = Int64[]

            if length(keys(advPortfolio.positions)) != length(keys(effInvPortfolio.positions))
                return false
            end
            
            for sym in keys(advPortfolio.positions)
                
                #sym = txn.securitysymbol
                posAdvice = get(advPortfolio.positions, sym, nothing)
                posInvestor = get(effInvPortfolio.positions, sym, nothing)

                if(posAdvice == nothing || posInvestor == nothing)
                    error("Transaction in Invalid Position: $(sym.ticker)")
                end
                remainder = posInvestor.quantity % posAdvice.quantity
                
                if(abs(remainder) > 0)
                    error("Invalid quantity in $(sym.ticker)")
                end

                push!(multiple, round(posInvestor.quantity / posAdvice.quantity))

            end

            #check if all are equal
            return all(y->y==multiple[1], multiple)

        else
            return true
        end

    catch err
        rethrow(err)
    end
end

###
# Internal Function
# Validate portfolio for positions (and internal stocks)
###
function _validate_portfolio(port::Dict{String, Any}; checkbenchmark = true, dollarposition = false)   
    try 
        portfolio = nothing
        if haskey(port, "detail")
            portfolio = !dollarposition ? 
                convert(BackTester.Portfolio, port["detail"]) :
                convert(BackTester.DollarPortfolio, port["detail"])
        else
            error("Empty portfolio")
        end 
        
        benchmark = get(port, "benchmark", nothing)

        if checkbenchmark
            if benchmark == nothing
                error("Benchmark is not present")
            end

            benchmark = convert(BackTester.Security, port["benchmark"])
            
            if benchmark == Security()
                error("Invalid benchmark security")
            end
        end
        
        return (true, portfolio)
    catch err
        rethrow(err)
    end
end
