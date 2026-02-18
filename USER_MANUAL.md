# User Manual: Modern Punch

## Introduction
Modern Punch is a web-based attendance and shift management system designed for teams. It allows employees to clock in/out, take breaks, and view their schedules, while administrators can manage teams, approve user registrations, and monitor attendance in real-time.

---

## Getting Started

### Accessing the System
- **Web Interface**: Open the application URL in your browser.
- **Login**: Use your username and password.
- **Self-Registration**: If you don't have an account, click "Request Account" on the login page.

---

## 1. Employee Guide

### Registration (First Time Users)
1. Go to the login page and click **"Request Account"**.
2. Fill in your details:
   - **First Name / Last Name**: Your legal name.
   - **Display Name**: The name shown to your team.
   - **Desired Username**: Unique username for login.
   - **Password**: At least 6 characters.
   - **Staff Code**: Your unique employee ID (provided by your manager).
3. Submit the request.
4. An administrator will review your request. Once approved, you can log in.

### Dashboard (Punching In/Out)
Once logged in, you will see the **Employee Dashboard**.

#### Clocking In
- Click the large **"PUNCH IN"** button to start your duty session.
- The system records your start time.

#### Taking Breaks
- While on duty, you can take breaks by clicking the corresponding break button (e.g., **"Lunch"**, **"Smoke"**, **"Rest"**).
- The break timer will start.
- Click **"End Break"** to return to duty.

#### Clocking Out
- At the end of your shift, click **"PUNCH OUT"**.
- This closes your session for the day.

### Viewing Schedule
- Your assigned shift (e.g., "09:00 - 18:00") is displayed on the dashboard.
- If no shift is assigned, you may see "No Shift".

---

## 2. Admin Guide

Administrators have access to the **Admin Dashboard** to manage the organization.

### Navigation
- **Users**: Manage employees, teams, and registrations.
- **Live Board**: Real-time view of who is working.
- **Shift Assignments**: Assign shifts to teams or individuals.

### Registration Management
New user requests appear in the **Registration Approval Queue** at the top of the Admin Users page.

#### Approving Users
1. **Verification Score**: The system automatically checks the user's **Staff Code** against the **Registration Roster**.
   - **Green (High Score)**: The Staff Code matches a known employee in the roster. Safe to approve.
   - **Yellow/Red**: No match found. Verify the user manually before approving.
2. Click **Approve** to create their account.
3. Click **Reject** to deny the request.

#### Managing the Roster
To ensure secure registration, add valid employee details to the **Registration Roster**.
- Go to the **Users** page -> **Registration Roster** section.
- Add a new entry with **Staff Code**, **Name**, and **Default Team**.
- This acts as a "whitelist" for incoming registration requests.

### Managing Teams
1. Go to the **Users** page.
2. Click **"+ Team"** to create a new team.
3. Define the **Team Name** and default **Shift Times** (e.g., 09:00 - 17:00).
4. Users assigned to this team will inherit these shift settings.

### Managing Users
- **Search**: Use the search bar to find users by name, username, or team.
- **Edit**: Click the "⋮" menu on a user row to **Edit** their role or team.
- **Reset Password**: You can reset a user's password if they forget it.
- **Deactivate**: Remove a user's access without deleting their data.

### Live Board
- View a real-time list of all employees currently **On Duty**.
- See their current status (Working, On Break) and how long they have been active.

### Shift Management
- Navigate to **"Shifts"** (if available in the specific deployment) or manage via **Teams**.
- You can create **Shift Presets** (e.g., "Morning Shift", "Night Shift") and assign them to specific Teams for specific date ranges.

---

## Frequently Asked Questions

**Q: I forgot my password.**
A: Contact an administrator. They can reset your password from the Admin Dashboard.

**Q: My verification score is low.**
A: Ensure you entered the correct **Staff Code** during registration. If the error persists, ask an administrator to check the Registration Roster.

**Q: Can I change my team?**
A: Only administrators can change your team assignment.

**Q: How do I fix a mistake in my punch (e.g., forgot to punch out)?**
A: Contact your manager/admin to manually correct your attendance record.
