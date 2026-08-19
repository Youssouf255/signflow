@echo off
title Activer la virtualisation pour Docker
echo.
echo Activation Hyper-V + WSL + Virtual Machine Platform...
echo.

dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Hyper-V-All /all /norestart
dism.exe /online /enable-feature /featurename:HypervisorPlatform /all /norestart

bcdedit /set hypervisorlaunchtype auto

echo.
echo WSL...
wsl --update
wsl --set-default-version 2
wsl --install -d Ubuntu --no-launch

echo.
echo ============================================
echo Termine. REDÉMARREZ le PC, puis ouvrez Docker Desktop.
echo ============================================
pause
