# @Author: Shiv Chawla
# @Date:   2019-02-12 16:16:44
# @Last Modified by:   Shiv Chawla
# @Last Modified time: 2019-03-06 20:09:01

#!/bin/bash
user="$1"
env="$2"
port="$3"
address="$4"

if id "$user" >/dev/null 2>&1; then
        echo "user exists"
else
        echo "user does not exist"
        mkdir /home/$user
	useradd $user -d /home/$user 
	#-g julia  	
	chown -R $user /home/$user
fi

cp /home/admin/$env/raftaar /home/$user/ -R
cp /home/admin/$env/aqbackend/Julia /home/$user/ -R

chown -R $user /home/$user/raftaar
chown -R $user /home/$user/Julia
chown -R $user /home/$user/.julia

chgrp -R $user /home/$user/raftaar
chgrp -R $user /home/$user/Julia
chgrp -R $user /home/$user/.julia

chmod -R u=rx /home/$user/raftaar
chmod -R u=rx /home/$user/Julia
chmod -R u=rwx /home/$user/.julia

cp /home/$user/Julia/Deploy/REQUIRE /home/$user/.julia/REQUIRE
mkdir -p /home/$user/.julia/config && cp /home/$user/Julia/Deploy/startup.jl /home/$user/.julia/config/startup.jl --force
		
# julia="/usr/local/julia/bin/julia"  
julia="/home/admin/julia-1.1.0/bin/julia"
process=/home/$user/Julia/src/julia_server.jl
sudo su - $user -c "$julia $process $port $address"

