#!/bin/bash

# Utility for automating the setup of node-jupyter project

julia_dir="/opt/julia"

echo "=================================="
echo "         JUPYTER SETUP"
echo "=================================="
echo

echo "INSTALLING PIP3"
apt-get install python3-pip

echo "UPGRADING PIP3"
pip3 install --upgrade pip

echo "INSTALLING JUPYTER"
pip3 install jupyter

echo "INSTALLING ZMQ"
apt-get install libzmq3
# This library is needed for IJulia to work.

echo "=================================="
echo "          JULIA SETUP"
echo "=================================="
echo

echo "DOWNLOADING JULIA"
wget https://julialang-s3.julialang.org/bin/linux/x64/0.5/julia-0.5.2-linux-x86_64.tar.gz

echo "EXTRACTING JULIA"
tar xzf julia-0.5.2-linux-x86_64.tar.gz

echo "COPYING JULIA TO /opt"
mkdir -p $julia_dir
cp -r julia-f4c6c9d4bb/* $julia_dir

echo "SETTING JULIA PATH"
PATH="$julia_dir/bin:$PATH"

echo "=================================="
echo "          IJULIA SETUP"
echo "=================================="
echo

echo "INSTALLING IJULIA"
export JULIA_PKGDIR=$julia_dir
jupyter_dir=$(which jupyter)
julia -e 'ENV["JUPYTER"]="'$jupyter_dir'"; Pkg.init(); Pkg.add("IJulia")'


echo "=================================="
echo "          JULIA KERNEL"
echo "=================================="
echo

mkdir -p /usr/local/share/jupyter/kernels/julia-0.5/
cp -r julia_kernel/* /usr/local/share/jupyter/kernels/julia-0.5/
sed -i.old '1s;^;ENV["JULIA_PKGDIR"]="/opt/julia"\n;' /opt/julia/v0.5/IJulia/src/kernel.jl

echo "=================================="
echo "          GROUPS SETUP"
echo "=================================="
echo

echo "SETTING UP GLOBAL GROUP"
./global.sh

echo "SETTING UP JAIL"
./jail.sh
