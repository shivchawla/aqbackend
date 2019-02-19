# @Author: Shiv Chawla
# @Date:   2019-02-12 16:16:44
# @Last Modified by:   Shiv Chawla
# @Last Modified time: 2019-02-12 17:54:57

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
cp /home/admin/$env/yojak /home/$user/ -R
cp /home/admin/$env/aqbackend/Julia /home/$user/ -R

chown -R $user /home/$user/raftaar
chown -R $user /home/$user/yojak
chown -R $user /home/$user/Julia

chgrp -R $user /home/$user/raftaar
chgrp -R $user /home/$user/yojak
chgrp -R $user /home/$user/Julia

chmod -R u=rx /home/$user/raftaar
chmod -R u=rx /home/$user/yojak
chmod -R u=rx /home/$user/Julia

cp /home/$user/Julia/Deploy/.juliarc.jl /home/$user/.juliarc.jl
cp /home/$user/Julia/Deploy/REQUIRE /home/$user/.julia/v0.6/REQUIRE
cp -r /home/$use/Julia/Deploy/Redis-src/* /home/$user/.julia/v0.6/Redis/src/

chown -R $user /home/$user/.juliarc.jl
chgrp -R $user /home/$user/.juliarc.jl
		
julia="/usr/local/julia/bin/julia"  
process=/home/$user/Julia/julia_server.jl
sudo su - $user -c "$julia $process $port $address"
