using Pkg

user = ENV["USER"]
push!(LOAD_PATH, "/home/$user/raftaar/BackTester/")
push!(LOAD_PATH, "/home/$user/raftaar/Yojak/src/")
push!(LOAD_PATH, "/home/$user/raftaar/Logger/")
push!(LOAD_PATH, "/home/$user/raftaar/API/")
push!(LOAD_PATH, "/home/$user/raftaar/Optimizer/")
push!(LOAD_PATH, "/home/$user/raftaar/Utilities/")
push!(LOAD_PATH, "/home/$user/raftaar/MarketTechnicals/src")

function Pkg_update()
    pkgs = readlines(joinpath(homedir(), ".julia", "REQUIRE"))
    Pkg.add(pkgs)
    Pkg.update(pkgs)
end

Pkg_update()
Pkg.add(PackageSpec(name="Redis", rev="master"))
