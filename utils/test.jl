using JSON

m = JSON.parsefile("datarealtime.json")
k = JSON.parsefile("databacktest.json")

for i = 1:length(m)
    #sleep(0.001)
    JSON.print(m[i])
    if i < length(m)
      print(",")
    end
end

#print(",")
#JSON.print(k)
