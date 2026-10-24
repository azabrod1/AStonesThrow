#!/bin/sh
# Starts or resumes a run of stone.c in the background, niced: on one thread,
# or on N MPI ranks.
#
#   tools/basilisk/run.sh [--mpi N] DIR [name=value ...]   build stone.c into DIR and start it there
#   tools/basilisk/run.sh --resume DIR                     resume DIR from its latest complete dump
#
# The arguments are stone.c's (level=, radius=, speed=, depth=, air=, ...).
# They are saved in DIR/command.txt, and the rank count in DIR/ranks.txt, so
# a run killed midway (a restart) resumes with the same ones: the latest dump
# with its .stone file (written after the dump, so its presence means the dump
# is whole) becomes the restart, and every output is cut back to before the
# dump's time, so the resumed run writes no row twice. BASILISK must point at
# Basilisk's src/; --mpi needs mpicc and mpirun (Open MPI).
set -e
here=$(cd "$(dirname "$0")" && pwd)

start () {
  ranks=$(cat ranks.txt 2>/dev/null || echo 1)
  if [ "$ranks" -gt 1 ]; then
    OMP_NUM_THREADS=1 nohup nice -n 19 mpirun -np "$ranks" ./stone $(cat command.txt) >> log.txt 2>&1 &
  else
    OMP_NUM_THREADS=1 nohup nice -n 19 ./stone $(cat command.txt) >> log.txt 2>&1 &
  fi
  echo $! > pid.txt
}

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
  start
  exit 0
fi

ranks=1
if [ "$1" = "--mpi" ]; then
  ranks=$2
  shift 2
fi
dir=$1
shift
mkdir -p "$dir"
# qcc works next to its source: build a copy, which also stays with the run.
cp "$here/stone.c" "$dir/stone.c"
cd "$dir"
if [ "$ranks" -gt 1 ]; then
  # Basilisk's config adds the system's feature macro to its own compiler, not to mpicc.
  [ "$(uname)" = Darwin ] && feature=-D_DARWIN_C_SOURCE || feature=-D_GNU_SOURCE=1
  CC99="mpicc -std=c99 $feature" qcc -O2 -Wall -disable-dimensions -D_MPI=1 stone.c -o stone -lm
else
  qcc -O2 -Wall -disable-dimensions stone.c -o stone -lm
fi
echo "$@" > command.txt
echo "$ranks" > ranks.txt
: > log.txt
start
echo "started $dir (pid $(cat pid.txt), $ranks rank(s)): ./stone $*"
