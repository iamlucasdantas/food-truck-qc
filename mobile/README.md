# FoodTruckQC mobile shell (Capacitor)

Wraps https://app.foodtruckqc.com in a native Android app. No web-app code changes needed.

- appId: com.foodtruckqc.app
- Capacitor 8
- www/index.html is only the offline fallback screen.

Build: npm install && npx cap add android && npx cap sync android, then build a signed AAB from android/.
