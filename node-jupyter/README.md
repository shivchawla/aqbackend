# node-jupyter

node-jupyter helps you in running jupyter notebook app for multi-users simultaneously.

Note: Jailing users in only available for Linux systems at the moment.

## Usage (no Jail)

 - Run `node index_nojail.js` and the app will be listening on port 8000.

## Usage (with Jail)

Only for Linux users.

 - Run init.sh for automatic installation of jailkit and setting up of a jail directory in the /home/jail directory.
 - After installation is completed, run `node index.js` with root privileges.

 (If you want to have a different jail directory then modify the `jail_dir` variable in both scripts/user.sh and scripts/jail.sh)


## Details

Further details can be found as comment in each individual file.
