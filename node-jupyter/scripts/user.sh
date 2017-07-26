#!/bin/bash

# Utility to add a new user and jail him inside the provided jail directory

# ARGUMENT LIST :
    # 1. USERNAME
    # 2. JAIL DIRECTORY
    # 3. DEFAULT NOTEBOOK

# Create new user on the system
echo "CREATING NEW USER"
useradd -m $1
echo "DONE"

# (Optional) Create a password for the user
# echo "ENTER PASSWORD FOR THE USER..."
# passwd $user_name

# Jail the newly added user inside the jail directory
echo "JAILING USER"
jk_jailuser -m -j $2 $1
echo "DONE"

# Copy the default notebook
echo "GENERATING DEFAULT NOTEBOOK"
cp $3 "$2/home/$1"
echo "DONE"

# Create the ijulia kernel for jupyter notebook
julia_kernel='{"display_name": "Julia 0.5.2", "argv": ["'$(which julia)'", "-i", "--startup-file=yes", "--color=yes", "'$HOME'/.julia/v0.5/IJulia/src/kernel.jl", "{connection_file}" ], "language": "julia"}';
mkdir -p "$2/home/$1/.local/share/jupyter/kernels/julia-0.5"
echo $julia_kernel > "$2/home/$1/.local/share/jupyter/kernels/julia-0.5/kernel.json"
