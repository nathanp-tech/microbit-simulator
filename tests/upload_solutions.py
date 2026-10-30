#!/usr/bin/env python3
"""Sends the answer key (api/_solutions.json, kept out of git) to the database of the online app.

    python3 tests/upload_solutions.py https://microbit-simulator.vercel.app TEACHER_PASSWORD
"""
import json, os, sys, urllib.request

base, code = sys.argv[1].rstrip('/'), sys.argv[2]
sol = json.load(open(os.path.join(os.path.dirname(__file__), '..', 'api', '_solutions.json'), encoding='utf-8'))
req = urllib.request.Request(base + '/api/admin', data=json.dumps({'action': 'put-solutions', 'solutions': sol}).encode(),
                             headers={'Content-Type': 'application/json', 'X-Teacher-Code': code})
print(urllib.request.urlopen(req).read().decode())
