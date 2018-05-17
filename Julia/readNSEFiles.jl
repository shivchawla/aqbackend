
using Raftaar
#NSE 15 minutes snapshot DATA

###
### DATA FORMAT
	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	#Total 8 Bytes

	#DATA
	#Security Token Short 2 Bytes
	#Last Traded Price Long 4 Bytes
	#Best Buy Quantity Long 4 Bytes
	#Best Buy Price Long 4 Bytes
	#Best Sell Quantity Long 4 Bytes
	#Best Sell Price Long 4 Bytes
	#Total Traded Quantity Long 4 Bytes
	#Average Traded Price Long 4 Bytes
	#Open Price Long 4 Bytes
	#High Price Long 4 Bytes
	#Low Price Long 4 Bytes
	#Close Price Long 4 Bytes
	#Filler Long 4 Bytes (Blank)
###

###
# Function to read/parse *.mkt file from NSE (15 minutes delayed snapshot)
###
function readMktFile(fname::String)
	try
		#open the file to read
		f = open(fname)
		output = Dict{String, Dict{Int16, TradeBar}}()

		output["RT"] = Dict{Int16, TradeBar}()
		output["EOD"] = Dict{Int16, TradeBar}()

		while !eof(f)
			tcode = read(f, Int16)
			timestamp = read(f, Int32)
			msgLength = read(f, Int16)

			stoken = read(f, Int16)
			#Divide prices (in paisa) by 100
			last = read(f, Int32)/100 
			bbq = read(f, Int32)
			bbp = read(f, Int32)/100
			bsq = read(f, Int32)
			bsp = read(f, Int32)/100
			ttq = read(f, Int32)
			atp = read(f, Int32)/100
			open = read(f, Int32)/100
			high = read(f, Int32)/100
			low = read(f, Int32)/100
			close = read(f, Int32)/100
			intHigh = read(f, Int32)/100
			intLow = read(f, Int32)/100
			intOpen = read(f, Int32)/100
			intClose = read(f, Int32)/100
			intTtq = read(f, Int32)
			blank = read(f, Int32)
			
			ttd = TradeBar(Dates.unix2datetime(timestamp), open, high, low, close, Int64(ttq))
			tt = TradeBar(Dates.unix2datetime(timestamp), intOpen, intHigh, intLow, intClose, Int64(intTtq))
			
			if intClose != 0.0
				output["RT"][stoken] = tt
			end

			if close != 0.0
				output["EOD"][stoken] = ttd
			end
		end

		#close the file
		close(f)

		return output
	catch err
		println(err)
		rethrow(err)
	end
end



###
### DATA FORMAT FOR INDEX DATA
	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	
	#DATA
	#Index Token Short 2 Bytes
	#Current Index Value Long 4 Bytes
	#High Index Value Long 4 Bytes
	#Low Index Value Long 4 Bytes
	#Percentage Change in Index Long 4 Bytes
	#Filler Long 4 Bytes (Blank)
###

###
# Function to read/parse *.mkt file from NSE (15 minutes delayed snapshot)
###
function readIndFile(fname::String)
	try
		#open the file to read
		f = open(fname)
		output = Dict{String, Dict{Int16, TradeBar}}()

		output["RT"] = Dict{Int16, TradeBar}()
		output["EOD"] = Dict{Int16, TradeBar}()

		while !eof(f)
			tcode = read(f, Int16)
			timestamp = read(f, Int32)
			msgLength = read(f, Int16)
		
			itoken = read(f, Int16) 

			#Divide prices (in paisa) by 100
			open = read(f, Int32)/100
			current = read(f, Int32)/100
			high = read(f, Int32)/100
			low = read(f, Int32)/100
			change = read(f, Int32)/100

			intHigh = read(f, Int32)/100
			intLow = read(f, Int32)/100
			intOpen = read(f, Int32)/100
			intClose = read(f, Int32)/100
			blank = read(f, Int32)

			#Computing close as this file is differnet from mkt file
			#Doesn't contain last close
			close  = round(current/(1+change/100), 2)

			ttd = TradeBar(Dates.unix2datetime(timestamp), open, high, low, close, 0)
			tt = TradeBar(Dates.unix2datetime(timestamp), intOpen, intHigh, intLow, intClose, 0)
			
			if intClose != 0.0
				output["RT"][itoken] = tt
			end
			
			if close != 0.0
				output["EOD"][itoken] = ttd
			end
		end

		#close the file
		close(f)

		return output
	catch err
		println(err)
		rethrow(err)
	end
end

###
### DATA FORMAT FOR SECURITY DATA	
	#HEADER
	#Transcode Short 2 Bytes
	#Timestamp Long 4 Bytes
	#Message Length Short 2 Bytes
	
	#DATA
	#Token Number Short 2 Bytes
	#Symbol Char 10 Bytes
	#Series Char 2 Bytes
	#Issued Capital Double 8 Bytes
	#Warning Percent Short 2 Bytes
	#Freeze Percent Short 2 Bytes
	#Credit Rating Char 12 Bytes
	#Issue Rate Short 2 Bytes
	#Issue Start Date Long 4 Bytes
	#Issue Pdate Long 4 Bytes
	#Issue Maturity Date Long 4 Bytes
	#Board Lot Quantity Long 4 Bytes
	#Tick Size Long 4 Bytes
	#Name of Company Char 25 Bytes
	#Record Date Long 4 Bytes
	#Expiry Date Long 4 Bytes
	#No Delivery Start Date Long 4 Bytes
	#No Delivery End Date Long 4 Bytes
	#Book Closure Start Date Long 4 Bytes
	#Book Closure End Date Long 4 Bytes
###

###
# Function to read security data
###
function readSecurityFile(fname::String)
	try
		#open the file to read
		f = open(fname)

		output = Dict{Int16, String}()

		i = 0
		while !eof(f)
			tcode = read(f, Int16)
			timestamp = read(f, Int32)
			msgLength = read(f, Int16)
			

			stoken = read(f, Int16) #2 Bytes 
			symbol = String(read(f, 10)) #10 Bytes #char 12
			#println("Symbol: $(symbol)")
			series = String(read(f, 2)) #2 Bytes #char 14
			#println("Series: $(String(series))")
			issuedCapital = read(f, Float64) #8 Bytes 22
			warningPct = read(f, Int16) #2 Bytes 24
			freezePct = read(f, Int16) #2 Bytes 26

			creditRating = String(read(f, 12)) #12 Bytes #char 38
			issueRateShort = read(f, Int16) #2 Bytes 40
			issueStartDate = read(f, Int32) #4 Bytes 44
			issuePDate = read(f, Int32) #4 Bytes 48
			issueMaturityDate = read(f, Int32) #4 Bytes 52
			lotQuantity = read(f, Int32) #4 Bytes 56
			tickSize = read(f, Int32) #4 Bytes 60
			nameCompany = String(read(f, 25)) #25 Bytes #char 85
			recordDate = read(f, Int32) #4 Bytes 89
			expiryDate = read(f, Int32) #4 Bytes 93
			noDeliveryStartDate = read(f, Int32) #4 Bytes 97
			noDeliveryEndDate = read(f, Int32) #4 Bytes 101
			bookClosureStartDate = read(f, Int32) #4 Bytes 105
			bookClosureEndDate = read(f, Int32) #4 Bytes 109
			
			if series == "EQ"
				output[stoken] = replace(rstrip(symbol), r"[^a-zA-Z0-9]", "_")
			end
		end

		#close the file
		close(f)

		return output
	catch err
		println(err)
		rethrow(err)
	end
end

function readAllSecurities() 
    
    securities = readSecurityFile(Base.source_dir()*"/Securities.dat")
    
    data = readcsv(Base.source_dir()*"/benchmark.csv", header=false)

    for row in 1:size(data)[1]
        code = data[row, 2]
        ticker = data[row,1]
        securities[code] = ticker
    end

    return securities
end    

