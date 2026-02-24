Set WshShell = CreateObject("WScript.Shell")
' The "0" means run completely hidden without a command prompt
WshShell.Run "python main.py", 0, False
