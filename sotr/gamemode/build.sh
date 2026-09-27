#!/bin/sh
# src/*.js dosyalarını sırayla birleştirip tek dosyalık gamemode.js üretir
cd "$(dirname "$0")" && cat src/*.js > gamemode.js && node --check gamemode.js && echo "gamemode.js hazır"
