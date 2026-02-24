@echo off
title Unified Hub WebUI
echo Installing required WebUI dependencies...
python -m pip install eel customtkinter pyaudio mss opencv-python Pillow pygetwindow
cls
echo Starting Unified Hub WebUI...
python main.py
pause