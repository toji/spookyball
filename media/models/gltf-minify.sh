#!/bin/bash
# Runs gltf-transform with several different options to reduce gltf fileize

gltf-transform resize $1 $2 --width $3 --height $3 
gltf-transform resample $2 $2
gltf-transform dedup $2 $2
gltf-transform prune $2 $2
gltf-transform etc1s $2 $2
gltf-transform draco $2 $2