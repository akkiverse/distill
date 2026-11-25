#!/bin/sh
# Nightly backup at about 02:30 (server time): a compressed pg_dump in ./backups, keeping KEEP_DAYS days.
set -e
while true; do
  now=$(date +%H%M)
  if [ "$now" = "0230" ]; then
    file="/backups/distill-$(date +%Y-%m-%d).sql.gz"
    pg_dump -h db -U distill_owner distill | gzip > "$file.tmp" && mv "$file.tmp" "$file"
    find /backups -name 'distill-*.sql.gz' -mtime +"${KEEP_DAYS:-14}" -delete
    sleep 61
  fi
  sleep 30
done
