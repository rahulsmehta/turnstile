#!/bin/bash

A=$(ps -ef | awk '/[r]edis.*.7000/{print $2}')
sudo kill $A
