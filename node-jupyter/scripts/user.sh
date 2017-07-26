#!/bin/bash

# Utility to add a new user and jail him inside the provided jail directory

# ARGUMENT LIST :
    # 1. USERNAME
    # 2. JAIL DIRECTORY
    # 3. DEFAULT NOTEBOOK

if [[ -z $1 ]]; then
    user_name="test"
else
    user_name=$1
fi

if [[ -z $2 ]]; then
    jail_dir="/home/jail"
else
    jail_dir=$2
fi

if [[ -z $3 ]]; then
    default_notebook="/home/kishlaya/projects/node-jupyter/Getting-Started.ipynb"
else
    default_notebook=$3
fi

# Create new user on the system
echo "CREATING NEW USER"
useradd -m $user_name
echo "DONE"

# (Optional) Create a password for the user
# echo "ENTER PASSWORD FOR THE USER..."
# passwd $user_name

# Jail the newly added user inside the jail directory
echo "JAILING USER"
jk_jailuser -m -j $jail_dir $user_name
echo "DONE"

# Copy the default notebook
echo "GENERATING DEFAULT NOTEBOOK"
cp $default_notebook "$jail_dir/home/$user_name"
echo "DONE"

# Create the ijulia kernel for jupyter notebook
julia_kernel='{"display_name": "Julia 0.5.2", "argv": ["'$(which julia)'", "-i", "--startup-file=yes", "--color=yes", "'$HOME'/.julia/v0.5/IJulia/src/kernel.jl", "{connection_file}" ], "language": "julia"}';
mkdir -p "$jail_dir/home/$user_name/.local/share/jupyter/kernels/julia-0.5"
echo $julia_kernel > "$jail_dir/home/$user_name/.local/share/jupyter/kernels/julia-0.5/kernel.json"
