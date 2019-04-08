# @Author: Shiv Chawla
# @Date:   2019-02-12 17:35:04
# @Last Modified by:   Shiv Chawla
# @Last Modified time: 2019-04-08 13:11:22

env="develop"
ports_production="6001 6002 6003 6004 6005 6006"
ports_staging="12001 13001"
ports_develop="12000 13000"
address="127.0.0.1"

if [ -z "$1" ]
  then
    echo "No environment supplied"
    echo "Defaulting: $env"         
else
    env="$1"
    echo "$env" 
fi

if [ -z "$2" ]
  then
    echo "No ports supplied"
    pv="ports_$env" 
    echo "Defaulting: ${!pv}" 
    ports="${!pv}"
        
else
    ports="$2"
fi


if [ -z "$3" ]
  then
    echo "No ports supplied"
    echo "Defaulting: ${address}" 
        
else
    address="$3"
fi


IFS=' ' read -a portsArray <<<"$ports"

for index in "${!portsArray[@]}"
do
  # do whatever on $index
  port=${portsArray[$index]}

  echo "Environment: $env"

  user=jp_${env}_${port}
  logfile="log__btserver_${env}_${port}.out"
  errfile="log__btserver_${env}_${port}.err"
   
  echo "Launching Backtest Server for $user"
  echo "Output in $logfile"

  pm2 start deployComputeServerAtPort.sh --name  "Julia_${env}_${port}" -- $user $env $port $address
done