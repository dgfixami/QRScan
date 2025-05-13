# Deployment Instructions for QR Scanner Web App

These instructions will help you deploy the QR Scanner web app so that it's only accessible to members of your organization (HBL Online) and properly authenticates users.

## Step 1: Set Up Google OAuth Credentials

First, you need to create OAuth credentials for the Google Sign-In functionality:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" and select "OAuth client ID"
5. Set the application type to "Web application"
6. Add a name like "QR Scanner App"
7. Add authorized JavaScript origins for your hosting domain
8. Click "Create"
9. Copy the Client ID (you'll need it in the next step)

## Step 2: Update the Script.js File

Open `script.js` and find this line near the top:

```javascript
const CLIENT_ID = ''; // You'll need to add your actual client ID here
```

Replace the empty string with your OAuth client ID from step 1.

Also, update the organization domain if needed:

```javascript
const organizationDomain = 'hblonline.nl'; // Replace with your actual domain
```

## Step 3: Deploy the API Scripts

### For Each Script (Code.gs, attendee-api.gs, bloomreachtosheets.gs, SheetsToSlides.gs):

1. Open the script in the Google Apps Script editor
2. Click on "Deploy" > "New deployment"
3. Select "Web app" as the deployment type
4. Configure the deployment settings:
   - Description: "QR Scanner App - Organization Access Only"
   - Execute as: "User accessing the web app"
   - Who has access: "Anyone within [your organization domain]"
5. Click "Deploy"
6. Copy the web app URL provided after deployment

### Update Script URLs in script.js

After deploying both API scripts, update the URLs in script.js:

```javascript
const scriptUrl = 'https://script.google.com/a/[your-domain.com]/macros/s/[YOUR-NEW-DEPLOYMENT-ID]/exec';
const attendeeApiUrl = 'https://script.google.com/a/[your-domain.com]/macros/s/[YOUR-NEW-DEPLOYMENT-ID]/exec';
```

## Step 4: Host the Web App Files

1. Host your HTML, CSS, and JavaScript files on your preferred web hosting platform
2. Ensure the hosting platform supports HTTPS (required for Google Sign-In)

## Step 5: Set Up Access to Google Sheets

For the web app to function with "Execute as: User accessing the web app", you need to:

1. Share the Google Sheet with everyone in your organization who needs to use the app
2. Set appropriate permissions (Edit access for those who need to update check-ins)

## Step 6: Testing and Verification

1. Open your deployed web app in a browser
2. You should see the Google Sign-In button
3. Sign in with your organization email
4. Verify that scanning works and logs the user who performed the scan
5. Check the scan log sheet to confirm user information is being recorded

## Troubleshooting

If you encounter issues:

1. Check browser console for JavaScript errors
2. Verify Google Apps Script deployment settings are correct
3. Make sure the Google Cloud Console OAuth credentials have the correct origins
4. Check the Apps Script execution logs for backend errors

## Security Notes

- The app now requires users to authenticate with their Google account
- Only users with emails in your organization domain (@hblonline.nl) can use the app
- Every scan is now logged with the user's name and email for accountability
- The app uses OAuth 2.0 tokens for authentication, protecting user credentials
