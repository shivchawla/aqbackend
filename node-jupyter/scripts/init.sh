#!/bin/bash

## Utility to donwload jailkit and install it on the system

# Download jailkit
wget https://olivier.sessink.nl/jailkit/jailkit-2.19.tar.gz 

# Extract
tar xzf jailkit-2.19.tar.gz
cd jailkit-2.19

# Install
./configure
make
make install
