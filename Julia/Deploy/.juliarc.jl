user = ENV["USER"]
push!(LOAD_PATH, "/home/$user/raftaar/Engine/")
push!(LOAD_PATH,"/home/$user/yojak/src/")
push!(LOAD_PATH,"/home/$user/raftaar/Output/")
push!(LOAD_PATH,"/home/$user/raftaar/API/")
push!(LOAD_PATH,"/home/$user/raftaar/Optimizer/")

Pkg.init()
Pkg.resolve()