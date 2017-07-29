#!/bin/bash

julia_dir="/opt/julia"

echo "=================================="
echo "         JUPYTER SETUP"
echo "=================================="
echo

echo "INSTALLING PIP3"
apt-get install python3-pip

echo "UPGRADING PIP3"
pip3 install --install jupyter

echo "INSTALLING JUPYTER"
pip3 install jupyter

echo "=================================="
echo "          JULIA SETUP"
echo "=================================="
echo

echo "EXTRACTING JULIA"
tar xzf julia-0.5.2-linux-x86_64.tar.gz

echo "COPYING JULIA TO /opt"
cp -r julia-f4c6c9d4bb $julia_dir

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

echo "=================================="
echo "          GROUPS SETUP"
echo "=================================="
echo

echo "SETTING UP GLOBAL GROUP"
./global.sh

echo "SETTING UP JAIL"
./jail.sh

