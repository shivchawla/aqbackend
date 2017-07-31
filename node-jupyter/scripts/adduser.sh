#!/bin/bash

# USER SETUP

# Check if arguments were supplied correctly
if [ -z $1 ]; then
	echo "Username not specified"
	exit 1
else
	username=$1
fi

if [ -z $2 ]; then
	echo "Pasword not specified"
	exit 1
else
	password=$2
fi

if [ -z $3 ]; then
	notebook='/home/cauchy/node-jupyter/Getting-Started.ipynb'
else
	notebook=$3
fi

# Group names
jailgroupname="jail"
globalgroupname="global"


# Add the user to the system
useradd -m $username

# Set a password for user
echo -e "$password\n$password" | passwd $username

# Add the user to jail and the global groups
usermod $username -aG $jailgroupname,$globalgroupname

# Add julia path to the users bash
echo "PATH=\"/opt/julia/bin:$PATH\"" >> /home/$username/.bashrc
# XDG_RUNTIME_DIR tells jupyter where to write the notebook cookie secret file
# The above mentioned directory (where cookie is saved) should be writable by the user
echo "export XDG_RUNTIME_DIR=/home/$username/" >> /home/$username/.bashrc
# This tells julia where to look for packages
echo "export JULIA_PKGDIR=/opt/julia/" >> /home/$username/.bashrc

# Restrict user's directory
chmod go-rwx /home/$username

# Copy the default notebook
cp $notebook /home/$username/
