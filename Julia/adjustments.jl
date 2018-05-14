function _get_dividends(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/dividends.csv", header=true)

    dividends = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        fv = convert(Float64, data[row, find(headers.=="fv")[1]])
        pct = convert(Float64, data[row, find(headers.=="percentage")[1]])*0.01
        fdate = Date(data[row, find(headers.=="date")[1]])

        if Date(fdate) == Date(date)
            dividends[security.symbol] = fv*pct
        end

    end

    return dividends
end

function _get_splits(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/splits.csv", header=true)

    splits = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        ofv = convert(Float64, data[row, find(headers.=="ofv")[1]])
        nfv = convert(Float64, data[row, find(headers.=="nfv")[1]])
        fdate = Date(data[row, find(headers.=="date")[1]])

        if Date(fdate) == Date(date)
            splits[security.symbol] = ofv > 0.0 ? nfv/ofv : 1.0
        end

    end

    return splits
end

function _get_bonus(date::DateTime)
    (data, headers) = readcsv(Base.source_dir()*"/bonus.csv", header=true)

    bonus = Dict{SecuritySymbol, Float64}()
    for row in 1:size(data)[1]
        ticker = data[row, find(headers.=="ticker")[1]]
        security = getsecurity(String(ticker))
        ratio = data[row, find(headers.=="ratio")[1]]
        fdate = Date(data[row, find(headers.=="date")[1]])

        n = parse(split(ratio,':')[1])
        d = parse(split(ratio,':')[2])

        if Date(fdate) == Date(date)
            bonus[security.symbol] = d/(n+d)
        end

    end

    return bonus
end

function _update_portfolio_dividends(port::Portfolio, date::DateTime = currentIndiaTime())
    dividends = _get_dividends(date)
    cashgen = 0.0
    updated = false
    for (sym,dividend) in dividends
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            dividendCash = pos.quantity * dividend
            pos.dividendCash += dividendCash
            cashgen += dividendCash
            pos.lastprice = pos.lastprice > 0 ? pos.lastprice - dividend : 0.0
        end
    end

    port.cash += cashgen

    return (updated, port)
end

function _update_portfolio_splits(port::Portfolio, date::DateTime = currentIndiaTime())
    splits = _get_splits(date)

    updated = false
    for (sym, splt) in splits
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            pos.quantity = Int(round(pos.quantity * 1.0/splt, 0))
            pos.lastprice = pos.lastprice * splt
            pos.averageprice = pos.averageprice * splt
        end
    end

    return (updated, port)
end

function _update_portfolio_bonus(port::Portfolio, date::DateTime = currentIndiaTime())
    bonus = _get_bonus(date)

    updated = false
    for (sym, bns) in bonus
        pos = port[sym]
        if pos.quantity > 0
            updated = true
            pos.quantity = Int(round(pos.quantity * 1.0/bns, 0))
            pos.lastprice = pos.lastprice * bns
            pos.averageprice = pos.averageprice * bns
        end
    end

    return (updated, port)
end
