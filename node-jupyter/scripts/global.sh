#!/bin/bash

# GLOBAL GROUP
# for accessing Julia

globalgroupname="global"

# Create the global group
groupadd $globalgroupname

# Make this group ownder of the julia directory
chown -R :$globalgroupname /opt


setfacl -Rm g:$globalgroupname:rwx /opt/julia
# Note: Write permission because julia tires to write to a cache file (something like /opt/julia/lib/v0.5/ZMQ.ji.IcUhxU) when compiling IJulia
