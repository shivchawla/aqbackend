#!/bin/bash

# GROUP SETUP

jailgroupname="jail"

# Create the jail group
groupadd $jailgroupname

# Set persmissions for jail
setfacl -m g:$jailgroupname:--x /
setfacl -m g:$jailgroupname:--x /*

setfacl -m g:$jailgroupname:--- /bin/*
setfacl -m g:$jailgroupname:r-x /bin/sh
setfacl -m g:$jailgroupname:r-x /bin/bash
setfacl -m g:$jailgroupname:r-x /bin/lesspipe

setfacl -m g:$jailgroupname:--x /lib/*
setfacl -m g:$jailgroupname:r-x /lib/x86_64-linux-gnu/*

setfacl -Rm g:$jailgroupname:--- /lib64
setfacl -m g:$jailgroupname:--x /lib64

setfacl -m g:$jailgroupname:--- /home/*

setfacl -Rm g:$jailgroupname:--- /boot
setfacl -Rm g:$jailgroupname:--- /cdrom
setfacl -Rm g:$jailgroupname:--- /media
setfacl -Rm g:$jailgroupname:--- /opt
setfacl -Rm g:$jailgroupname:--- /proc
setfacl -Rm g:$jailgroupname:--- /root
setfacl -Rm g:$jailgroupname:--- /run
setfacl -Rm g:$jailgroupname:--- /sbin
setfacl -Rm g:$jailgroupname:--- /srv
setfacl -Rm g:$jailgroupname:--- /sys
setfacl -Rm g:$jailgroupname:--- /var
