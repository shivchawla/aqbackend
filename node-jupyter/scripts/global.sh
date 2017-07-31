#!/bin/bash

# GLOBAL GROUP
# for accessing Julia

globalgroupname="global"

# Create the global group
groupadd $globalgroupname

# Make this group owner of the julia directory
chown -R :$globalgroupname /opt


setfacl -Rm g:$globalgroupname:rwx /opt/julia
# Note: Write permission because julia tires to write to a cache file (something like /opt/julia/lib/v0.5/ZMQ.ji.IcUhxU) when compiling IJulia

# Reflect the julia package directory in IJULIA kernel.jl 
sed -i.old '1s;^;ENV["JULIA_PKGDIR"]="/opt/julia"\n;' /opt/julia/v0.5/IJulia/src/kernel.jl
