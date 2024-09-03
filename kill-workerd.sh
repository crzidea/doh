#!/bin/bash
lsof -i :8787 | tail -n 1 | sed -e 's/^workerd //' -e 's/ .*//' | xargs kill -9
