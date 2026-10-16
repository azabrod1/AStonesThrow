#!/bin/sh
# Starts or resumes a run of stone.c in the background, niced, on one thread.
#
#   tools/basilisk/run.sh DIR [name=value ...]   build stone.c into DIR and start it there
#   tools/basilisk/run.sh --resume DIR           resume DIR from its latest complete dump
#
# The arguments are stone.c's (level=, path=, end=, fine=, air=, shape=). They
# are saved in DIR/command.txt, so a run killed midway (a container restart)
# resumes with the same ones: the latest dump with its .stone file (written
# after the dump, so its presence means the dump is whole) becomes the
# restart, and every output is cut back to before the dump's time, so the
# resumed run writes no row twice. BASILISK must point at Basilisk's src/.
set -e
here=$(cd "$(dirname "$0")" && pwd)

if [ "$1" = "--resume" ]; then
  dir=$2
  cd "$dir"
  latest=$(ls dump-*.stone 2>/dev/null | sort | tail -n 1)
  if [ -z "$latest" ]; then
    echo "no complete dump in $dir" >&2
    exit 1
  fi
  dump=${latest%.stone}
  time=${dump#dump-}
  ln -sf "$dump" restart
  ln -sf "$latest" restart.stone
  for file in stone.csv gauges.csv regions.csv drops.csv; do
    [ -f "$file" ] && awk -F, -v limit="$time" 'NR == 1 || $1 + 0 < limit - 1e-9' "$file" > "$file.cut" && mv "$file.cut" "$file"
  done
  for file in axis.txt profiles.txt; do
    [ -f "$file" ] && awk -v limit="$time" '$1 + 0 < limit - 1e-9' "$file" > "$file.cut" && mv "$file.cut" "$file"
  done
  echo "resuming $dir from t = $time" | tee -a log.txt
  OMP_NUM_THREADS=1 nohup nice -n 19 ./stone $(cat command.txt) >> log.txt 2>&1 &
  echo $! > pid.txt
  exit 0
fi

dir=$1
shift
mkdir -p "$dir"
# qcc works next to its source: build a copy, which also stays with the run.
cp "$here/stone.c" "$dir/stone.c"
cd "$dir"
qcc -O2 -Wall -disable-dimensions stone.c -o stone -lm
echo "$@" > command.txt
OMP_NUM_THREADS=1 nohup nice -n 19 ./stone "$@" > log.txt 2>&1 &
echo $! > pid.txt
echo "started $dir (pid $!): ./stone $*"
