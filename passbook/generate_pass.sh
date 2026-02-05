#!/bin/bash

# INSTRUKCJA GENEROWANIA PKPASS dla #BETON | CALPIK 2026
# 
# WYMAGANIA:
# 1. Konto Apple Developer (99$/rok)
# 2. Certyfikat Pass Type ID 
# 3. Narzędzie signpass lub online generator

echo "=== #BETON PKPASS GENERATOR ==="
echo ""
echo "🔐 WYMAGANE CERTYFIKATY:"
echo "1. Wejdź na https://developer.apple.com"
echo "2. Certificates, IDs & Profiles > Identifiers"
echo "3. Utwórz nowy Pass Type ID: pass.com.betonn.calpik2026"
echo "4. Pobierz certyfikat (.p12)"
echo ""

echo "🛠️ OPCJE GENEROWANIA:"
echo ""
echo "OPCJA 1 - Online Generator (łatwiejsze):"
echo "• https://passbook-generator.com"
echo "• https://passcreator.com" 
echo "• Wgraj pass.json i loga, pobierz .pkpass"
echo ""

echo "OPCJA 2 - Lokalnie (dla zaawansowanych):"
echo "• Zainstaluj: npm install -g passbook"
echo "• Dodaj certyfikat Apple do keychain"
echo "• Uruchom: signpass -p pass.json"
echo ""

echo "OPCJA 3 - Python (programistycznie):"
echo "• pip install passbook"
echo "• Używaj z certyfikatami Apple"
echo ""

echo "📱 TESTOWANIE:"
echo "• Wyślij .pkpass mailem na iPhone"
echo "• Lub hostuj na betonn.cc/pass.pkpass"
echo "• Kliknij i dodaj do Apple Wallet"
echo ""

echo "🎨 GRAFIKI POTRZEBNE:"
echo "• icon.png (29x29px - wymagane)"
echo "• icon@2x.png (58x58px)" 
echo "• icon@3x.png (87x87px)"
echo "• logo.png (160x50px)"
echo "• logo@2x.png (320x100px)"
echo "• logo@3x.png (480x150px)"
echo ""

echo "Czy chcesz, żebym przygotował grafiki z logo AGH i #BETON? (y/n)"