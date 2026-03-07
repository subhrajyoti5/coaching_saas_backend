#!/usr/bin/env node

/**
 * Developer Drive Token Generator
 * 
 * This script helps you generate a refresh token for your developer Google Drive account.
 * The token will be stored encrypted in DEVELOPER_DRIVE_REFRESH_TOKEN environment variable.
 * 
 * Usage: node scripts/get-developer-drive-token.js
 */

const readline = require('readline');
const { google } = require('googleapis');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
};

const getOAuthClient = (clientId, clientSecret, redirectUri) => {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const main = async () => {
  console.log('\n========================================');
  console.log('Developer Drive Token Generator');
  console.log('========================================\n');

  // Get credentials from environment or prompt user
  let clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  let redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    console.log('Google Drive OAuth credentials not found in .env file.\n');
    console.log('Please enter your Google OAuth credentials:');
    console.log('(You can find these at https://console.cloud.google.com/)\n');

    clientId = await question('Client ID: ');
    clientSecret = await question('Client Secret: ');
    redirectUri = await question('Redirect URI (e.g., http://localhost:5000/api/drive/connect/callback): ');
  } else {
    console.log('Using credentials from .env file:');
    console.log(`Client ID: ${clientId.substring(0, 10)}...`);
    console.log(`Redirect URI: ${redirectUri}\n`);
  }

  const oauth2Client = getOAuthClient(clientId, clientSecret, redirectUri);

  // Generate authorization URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_SCOPE, 'email', 'profile'],
    include_granted_scopes: true
  });

  console.log('\n========== STEP 1: Authorization ==========');
  console.log('Please visit this URL to authorize your developer Google account:');
  console.log('\n' + authUrl + '\n');
  console.log('After authorizing, you will be redirected to a callback URL.');
  console.log('The URL will contain a "code" parameter.\n');

  const code = await question('Enter the authorization code from the redirect URL: ');

  if (!code) {
    console.error('\nError: No code provided. Exiting.');
    rl.close();
    process.exit(1);
  }

  try {
    console.log('\n========== STEP 2: Exchanging Code for Tokens ==========');
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.error('\nError: Google did not return a refresh token.');
      console.error('This usually happens when:');
      console.error('  1. You did not consent (click "Allow"/"Accept")');
      console.error('  2. The account already authorized this app');
      console.error('\nTry again with "prompt=consent" force in the OAuth URL.\n');
      rl.close();
      process.exit(1);
    }

    const developerEmail = await question('Enter your developer Gmail address (for reference): ');

    console.log('\n========== CONFIGURATION READY ==========\n');
    console.log('Add the following to your .env file:\n');
    console.log(`DEVELOPER_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`DEVELOPER_DRIVE_EMAIL=${developerEmail}\n`);
    console.log('Then restart your server.\n');

    // Optional: Save to .env file
    const saveToFile = await question('Would you like to save these to .env file? (yes/no): ');
    if (saveToFile.toLowerCase() === 'yes') {
      const fs = require('fs');
      const envPath = path.resolve(__dirname, '../.env');
      let envContent = fs.readFileSync(envPath, 'utf8');

      // Update or add the new settings
      if (envContent.includes('DEVELOPER_DRIVE_REFRESH_TOKEN')) {
        envContent = envContent.replace(
          /DEVELOPER_DRIVE_REFRESH_TOKEN=.*/,
          `DEVELOPER_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`
        );
      } else {
        envContent += `\n# Developer Drive Configuration\nDEVELOPER_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`;
      }

      if (envContent.includes('DEVELOPER_DRIVE_EMAIL')) {
        envContent = envContent.replace(
          /DEVELOPER_DRIVE_EMAIL=.*/,
          `DEVELOPER_DRIVE_EMAIL=${developerEmail}`
        );
      } else {
        envContent += `DEVELOPER_DRIVE_EMAIL=${developerEmail}\n`;
      }

      fs.writeFileSync(envPath, envContent);
      console.log('✓ Successfully saved to .env file!');
    }

    console.log('\n✓ Setup complete! Restart your server to start using the developer drive.\n');
  } catch (error) {
    console.error('\nError exchanging code for tokens:', error.message);
    rl.close();
    process.exit(1);
  }

  rl.close();
};

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
