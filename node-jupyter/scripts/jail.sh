#!/bin/bash

# Utility to generate the jail directory

## ===== Global Variables =====

jail_dir="/home/jail"
user_name="test"

## ===== Set up the jail directory =====

# Create jail directory
echo "CREATING JAIL DIRECTORY..."
mkdir $jail_dir

# (Optional) Chown the newly created jail directory
# echo "CHOWNING..."
# chown root:root $jail_dir

# Set up jail using jailkit
echo "GENERATING JAIL..."
jk_init -j $jail_dir jk_lsh ssh

# Copy bash to the new jail
jk_cp -j $jail_dir /bin/bash

# Copy python3 and jupyter to the new jail
jk_cp -k -j $jail_dir /usr/bin/python3
jk_cp -k -j $jail_dir /usr/lib/python3
jk_cp -k -j $jail_dir /usr/lib/python3.4
jk_cp -k -j $jail_dir /usr/local/lib/python3.4
jk_cp -k -j $jail_dir /usr/local/bin/jupyter*

# Copy julia to the new jail
julia_path=$(which julia)
jk_cp -k -j $jail_dir $julia_path

## ===== Create tmp directory for all users =====

echo "CREATING TMP DIRECTORY..."
temp_dir="$jail_dir/tmp"
mkdir $temp_dir
chmod a+rwx $temp_dir

## ===== DONE =====

echo "SETUP COMPLETED"
