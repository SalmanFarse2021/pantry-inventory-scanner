Thyme Saver:
Maverick Pantry Inventory WebApp
CSE 3311
Team 9
David Cai, Abril Hernandez, Ana Sanchez, Md Salman Farse

Table of Contents
Table of Contents 2
Executive Summary 3
Problem Statement 3
Proposal 3
Limitations 3
Github Repository and Version Control 4
Code Organization and Comments 4
Test Implementation 4
Users 5
Target Demographic: 5
User Feedback: 5
Core Features & Analysis 7
Core Functionality 7
Inputs, Outputs and Key Data Structures 7
Structure Diagram 7
Implementation Plan 8
Iteration 1 9
Iteration 2 [Deprecated] 9
Iteration 2 [Project Pivot] 10
Competitive Analysis 12
Scanlily - AI Inventory Tracking App 12
PantrySoft - Software Solution for Foodbank Inventory 12
Instagram - UTA Pantry’s Page 12
Sortly - Inventory Management Tool 13
Positioning Analysis and Market Differentiation 13
Risk Assessment & Management 16
Risk Exposure Identification 16
Mitigation Plan 16
Citations 18

Executive Summary

Problem Statement
The University of Texas at Arlington’s Maverick Pantry serves as a vital campus resource for students facing food insecurity. Nonetheless, the current operational model requires students to book appointments in advance without any visibility into real-time item availability. As a result, students often arrive only to find essential goods, dietary-specific foods, or hygiene products to be out of stock. Conversely, the pantry staff faces severe bandwidth limitations; their daily operations focus entirely on stocking and distributing physical items, leaving them without the time or logistics capacity to manually log and publish inventory lists online.
Proposal
To abridge this communication gap without burdening the pantry staff, we propose the Maverick Pantry Inventory WebApp, Thyme Saver. This system combines a public-facing, real-time inventory catalog for students with lightweight, AI-assisted intake and crowd-sourced stock verification tools.

The objective of Thyme Saver in this pivot is to establish a proof-of-concept that validates the technical and operational feasibility of a crowdsourced, AI-assisted inventory tracking system for campus food pantries. By deploying this MVP, we aim to gather empirical usage data, quantify student engagement, and evaluate whether a community-driven model effectively mitigates asymmetric inventory information. Ultimately, this project serves as a foundational benchmark and pilot study, paving the path, generating real-world data, and creating a scalable framework that future engineering teams or campus stakeholders can adopt, expand, and maintain.

Some key components:
AI-assisted inventory tool that uses image recognition for fast intake
Publicly accessible website that shows available items in the pantry

Limitations
The app is unable to place reservations / hold items for users because the pantry staff is unavailable to coordinate directly at this time. The pantry staff is also unable to participate in this project at this time because it requires more workers and work time than they have available.
Exact inventory quantity is unfeasible because it would mean that users must keep an exact count of the items. If inventory were to fluctuate and the count is not updated, it could potentially cause discrepancies which is why we opted to simplify it to whether or not the item is available. Since this app is powered by users who visit the pantry, we aren’t able to completely control how users update items and there may be a possibility that users are accurately updating the stock. Code Architecture and Test Strategy
Github Repository and Version Control
A complete source code and project documentation for Thyme Saver will be hosted publicly on GitHub and maintained under version control practices.

Repository URL: https://github.com/davidxcai/pantry-inventory-scanner
Public Link: pantry-inventory-scanner.vercel.app
Core Technology Stack: React, TypeScript, TanStack Router, Zustand, Tailwind, Supabase, Vercel

Version
Date
Authors
Status
v1.0
September 14, 2026
Team 9
Inception Written Deliverable.

v1.1

September 21, 2026

Team 9
Added architecture diagram, data structure, and exception use-cases per lead feedback.
v2.0
October 10, 2026
Team 9
Pivot from personal meal planning to a community based food pantry log.

Code Organization and Comments
The codebase is modularized by feature folders, separating UI components, TanStack Query hooks, and client-side business logic into single purpose files. Documentation is written throughout the repository via markdown files. The single page application is hosted on Vercel which also holds the serveless functions.
Test Implementation
Unit tests are written using Vitatest to validate edge cases for the suggestion ranking algorithm (handling exceptions, filters, and sorting).
Integration and RLS (Row Level Security) policies are actively tested to verify that unauthorized or unauthenticated users cannot modify stock statuses or access restricted student account data. Tests ensure only users with an active UTA email session can trigger item update endpoints, preserving data integrity and accountability.
Users
Target Demographic:
Our app specifically targets a subset of UTA students:
Students who visit the UTA Pantry
Students who are struggling to meet nutritional needs

The UTA Pantry provides free donation items for students in need of welfare assistance. To visit the Pantry, you must book an appointment ahead of time to visit; they do not accept walk-ins. The stock frequently changes which means that items in rotation this week may be gone the next week. This creates a problem where students potentially do not know what is available in the Pantry and might book an appointment, only to find that the required item is not available, wasting time.

Our plan is to mitigate this issue and help students save time by knowing what’s available ahead of time so they can better plan their appointments.
User Feedback:

Our research was initially conducted with students on campus who visit the pantry. We’ve identified a problem where the majority of them don’t know what the Pantry offers. Another point of concern is that they have to carefully schedule an appointment for the Pantry because it's not open all week. The schedule is limited to Tuesday through Thursday from 9 AM to 3 PM typically.

We’ve spoken to the Pantry manager to discuss the proposal to this issue. The manager expressed reluctance to fully have the staff participate in updating inventory using our items because they are busy with stocking items and intaking donations weekly. This brought us to our contingency plan which was having students crowd-source the information weekly in order to keep stock updated. The manager was receptive to the compromise and offered us access to the Pantry on days they are closed to test the idea and gather more feedback. Our plan is to visit the pantry weekly on a rotation between our group members to update the app. We will also continue to search for students who are interested in testing the app as well as those who require volunteer hours.

We’re looking for both quantitative and qualitative data through empirical research. For qualitative data, we want to know if the process itself is seamless and simple to use. Students typically visit for 10-15 minutes per visit and their time is valuable, so we’d like to make the process as quick as possible. We will also survey students during their visit and ask if they’ve used our website and if it’s helpful in planning their appointment.

For qualitative data, we plan to track the number of visits on our site through analytics and monitor the page views to see if it reaches students. In addition, we want to track the accuracy of the items by visit each week to make sure things are updated correctly.
Core Features & Analysis
Core Functionality
Users will be able to view items available in the pantry through the website
Users will be able to update the pantry items during their visit
Inputs, Outputs and Key Data Structures

Structure Diagram

Inputs: Image files captured via mobile camera and user authentication credentials.
Outputs: JSON payload responses containing item availability statuses, freshness stamps, and categorized inventory lists.
Datastructures: Database table models for items (item ID, name, category, name, availability status) and verifications (user ID, item ID, timestamp).
Implementation Plan
The table below outlines the features planned for the system and their priority using the MoSCoW method. Features are categorized as Must, Should, Could, or Won’t based on their importance to the overall system. Each feature is also assigned a number that will be used to reference it in the iteration plans and track its implementation throughout the project.

Update: might want to add a notification system of “notify me when in stock” to make it better.
ID
Priority
Feature/Description
Status
P-01
Must
System must provide a responsive front-end application in web browser that is accessible on a mobile device such as phone or tablet
In Progress
P-02
Must
Users must be able to take picture and update within 5 seconds
In Progress
P-03
Must
System will update site inventory in real-time and display current availability of pantry items
In Progress
P-04
Must
Users are able to create an account with their UTA email to be eligible for updating stock
In Progress
P-05
Must
Multiple users shall be able to update the same items
Planned
P-07
Should
System will show the last-updated timestamp of items on the website
Planned
P-08
Should
Users will have account management features such as changing passwords.
Planned

P-09
Should
Gather usage data analytics to track user engagement from site visits
Planned

P-10
Should
System will show timeline of when specific items were updated by users
Planned
P-11
Should
System will prevent users from submitting incorrect or inappropriate content through moderation filters in pipeline
Planned
P-12
Could
Website may have in-stock notifications for users who have an account and a valid email address
In Consideration
P-13
Won’t
System will not support adding items to a cart to reserve pantry items
-

P-14
Won’t
System will not keep track of numerical quantity of items in stock
-

P-15
Won’t
Pantry updates will not be done by the pantry staff
-

Iteration 1
Goal and User Benefit: Establish the foundational responsive frontend/backend infrastructure, user authentication, and profile setup so users can log in, input their dietary restrictions, and safely manage their pantry preferences without decision fatigue.

User Feedback Alignment:
Feedback Addressed: “I want to make sure my food allergies and basic pantry staples are remembered so I don’t have to re-enter them every time.”
UAT/Testing Method: Tested Via internal team walkthroughs and peer student feedback to verify that allergy filters successfully block restricted ingredients during recipe generation.

Tasks:
Setup frontend and backend integration for responsive web application
Test user signup, authentication, and session management.
Build user profile handling for allergies and pantry defaults.
Begin seeding databases with normalized recipes from external data sources.

Use-Case & Exception Handling: Profile and Allergy Configuration
Normal Flow: User creates an account, inputs dietary preferences/allergies, and saves their profile
Exception Case A (No Allergies): If the user leaves the allergy field blank, the system applies normal filtering without over-restricting results.
Exception Case B (Allergen Conflict): If an allergen is present, recipes containing that ingredient are completely blocked from automated suggestions.

Iteration 2 [Deprecated]
Goal and User Benefit: Implement core database retrieval, pantry inventory tracking, and the automated weekly meal plan generator so users can transition from raw ingredients to an actionable schedule without manual planning stress.

User Feedback Alignment:
Feedback Addressed: “It’s hard to think of recipes that use my leftover ingredients; I don’t want to think about what to cook when I get home.”
UAT/Testing Method: Validated through internal student testing to ensure meal planner correctly pulls matching recipes from the database and maps them across the week.
Tasks:
Retrieve and filter normalized recipes from the seeded database.
Build user account management and pantry inventory tracking.
Implement the automated weekly meal plan feature.

Use-Case & Exception Handling: Weekly Meal Planning
Normal Flow: User selects their available pantry items and time constraints; the system automatically populates a 7 day meal calendar. (Monday through Sunday).
Exception Case A (Empty Pantry): If the pantry has missing or insufficient ingredients for a planned meal, the system flags the day and feeds those missing items directly into the automated grocery list.
Example: “Needs Eggs!”
Exception Case B (Manual Override): If a user manually changes the scheduled day’s meal, the system updates the calendar without breaking the rest of the weekly sequence.
Iteration 2 [Project Pivot]
Our initial project direction, a generic meal-planning and recipe application, operated in an oversaturated market, making it difficult to establish a distinct value proposition or differentiate ourselves from established commercial competitors.

To create a high-impact, defensible product, we pivoted to building a hyper-local community-driven inventory catalog designed specifically for the UTA Maverick Pantry. By narrowing our scope to solve a direct, immediate operational friction on campus, eradicating student uncertainty around item availability before booking appointments, we shifted from a generic consumer utility to an essential, high-value campus tool with clear target audience and measurable local utility.

Goal and User Benefit: Establish the foundational system architecture and deployment pipeline for the web application to support crowdsourced item cataloging and verification. Begin conducting empirical research on students who attend the pantry to map real-world usage patterns, validate intake friction, and refine user stories.

User Feedback Alignment:
Feedback Addressed: “I’m not sure what the UTA Pantry has in-stock, and I don’t want to book an appointment only to find out they don’t have what I need.”
UAT/Testing Method: Deploy a responsive web application that displays categorized pantry items with community-verified status tags (In stock, low stock, out of stock) backed by timestamped freshness indicators (e.g “verified 2 hours ago by 3 students”).

Tasks:
Setup frontend & backend integration: initialize a mobile-responsive web application repository, establish database connectivity, and deploy the staging environment.
User session & auth management: implement lightweight authentication and session handling for student verification (by requiring a valid UTA email address).
Pantry item catalog schema & crowdsourcing engine: build the core database models for item categories and set up the verification endpoint.
AI vision pipeline sandbox integration: configure a vision API endpoint (e.g. Gemini Flash) to parse multi-item batch photos into structured product suggestions for rapid shopper logging.

Use-Case & Exception Handling: Student Scanning
Normal Flow: A student views an item on the pantry catalog page. The student takes a picture of the item in stock to verify that it is currently in stock. The system records the submission, updates the item’s availability status, and refreshes the timestamped freshness tag.
Exception Case A (Outdated item entry): An item receives no community verifications for a prolonged period of time (over 1 week). The UI will plainly display the original date but add an additional note that indicates how long ago was the last update and that this entry may be inaccurate.
Exception Case B (Accountability & Public Attribution): A student submits an incorrect or malicious item status update. The system explicitly attaches and displays the updating user’s public profile name directly alongside the item status. By eliminating anonymity, malicious updates are discouraged through direct accountability.
Competitive Analysis
Scanlily - AI Inventory Tracking App
Link: https://www.scanlily.com/

Similarities: In terms of technical intake, Scanlily is the most similar to our web app. It offers a solution to scan items with pictures and it uses AI to identify/categorize items. They also have a public site that can be shared with users to see where things are stocked.

Differences: They have a video-stocking feature where users can simply record a video of the items they want to stock and their AI pipeline will parse and identify items in the video. It’s quick and accurate. This is a paid solution requiring a subscription to use their features.

How we stand out: While our core intake is the same, the limitation of this app is that it does not support multiple users to crowd-source information. The intake would come entirely from one-person which makes this unfeasible. Our app is also powered by free-tier versions of LLMs and has been estimated to work within the free-tier without ever needing a paid subscription.

PantrySoft - Software Solution for Foodbank Inventory
Link: https://pantrysoft.com/

Similarities: UTA Pantry is currently using this as their appointment booking system. PantrySoft actually offers solutions to display items in stock like a pantry and even has an add-to-cart feature that lets users reserve things to pick up. The website can be made public for users to see.

Differences: UTA Pantry did not take advantage of the public facing website capabilities even though it’s offered as a solution through an enterprise plan. The manager’s feedback is once again that they don’t have time to frequently update the items in stock, leaving them without a website. It also does not have an AI-intake feature to stock/update items.

How we stand out: The crowd-sourcing intake and public website will be implemented by us, providing a solution that is not offered by PantrySoft as they do not have a crowd-source intake option. Our intake flow is also different by using AI rather than manually entering item information.

Instagram - UTA Pantry’s Page
Link: https://www.instagram.com/utamaverickpantry/?hl=en

Similarities: The UTA Pantry is already posting items that they have on their page. They list items of the week as well as promotions of any special items they may receive. We are directly stocking the same data as them, but they have an established source of information and the data is truthful in the sense that it’s the pantry staff directly uploading data.

Differences: The posts of items of the week are frequently outdated and may go several weeks without any updates. They also do not list every item available at the pantry, often only listing 5-6 items at a time. There is no real-time information on stock availability or any form of updates notifying students that something may be out of stock. Our data is also crowd-sourced which takes the burden off of the workers.

How we stand out: Our webapp transitions the pantry from static, manually posted social media updates to a dynamic, searchable real-time catalog. By relying on crowdsourced student reporting and automated AI vision intake, rather than manual staff posts, students can check live availability instantly before scheduling a visit.

Sortly - Inventory Management Tool
Link: https://www.sortly.com/

Similarities: It provides a digital inventory interface that allows administrators to organize, categorize, and track stock levels using folders, tags, and item descriptions.

Differences: Sortly is built primarily for small businesses and internal asset tracking, meaning it lacks a public-facing student catalog where campus visitors can check real-time item availability before visiting. Additionally, it relies heavily on manual data entry, custom folder management, and barcode scanning by designated staff or admins, rather than using crowdsourced student reporting or automated AI vision intake for bulk donations.

How we stand out: While Sortly is designed strictly for internal inventory control behind closed doors, our application bridges the gap by pairing administrative ease with a public-facing student portal. It replaces rigid folder management with automated AI bulk intake and crowdsourced visitor updates, tailoring the software specifically to the unique, zero-budget needs of a student charity pantry.

Positioning Analysis and Market Differentiation
The chart below maps Thyme Saver against our primary competitors (Supercook, Paprika, and Mealime) across two main axes: Frequency of Use (Infrequent vs. frequent) and Target User Scalability (Individual/Single User vs. Multi User/Community-driven). We have also provided a structured comparison table for side by side comparison

Feature
Maverick Pantry App
Scanlily
PantrySoft
Instagram
Sortly
Cost
Free / Open Source
Paid subscription for full AI video parsing, batch processing, and advanced features
Paid enterprise software model geared toward formal food banks and agencies
Free (Platform built-in, but lacks inventory features)
Tiered pricing model ranging from basic tiers to paid monthly business plans
Target User Model
Real-time campus food pantry inventory and visibility for student shoppers
AI-powered asset and inventory management via photos, videos, and QR codes
Enterprise foodbank and pantry management software focused on client intake and bookings
Social media broadcasting and manual weekly story/post highlights
Visual inventory management and organization for small businesses using folders and barcodes
Staff Workload Impact
Zero Daily Burden: Relies on crowdsourced student reporting and volunteer intake rather than staff logging
Low-Medium: Requires a designated user to record inventory walkthrough videos or manage incoming item drafts
High Administrative burden: Requires staff to actively manage internal logs, appointment slots, and backend item tallies
High Manual Burden: Requires staff to manually design, photograph, and post weekly updates
Medium Burden: Requires staff or administrators to manually organize items into custom folders and tags
Student-Facing Visibility
Direct Public Catalog: Students view real-time item status before booking an appointment
Public link/QR views available, but designed for general asset/equipment tracking rather than charity pantries
Offers backend reservation/add-to-cart features, but UTA pantry leaves this public feature unused due to staff bandwidth
Limited/Static: Only shows a limited selection of weekly featured items via Stories and posts
None: No dedicated customer-facing public pantry catalog

Risk Assessment & Management
Risk Exposure Identification
ID
Risk
Probability (Percentage)
Effect (Hours for whole team)
Risk Exposure
R-01
Not enough users using our application
80
10
8
R-02
Group scheduling prevents weekly stock updates
20
4
5
R-03
Pantry staff unable to participate or accommodate project
90
10
9
R-04
Not enough time to work on project due to pivot
50
10
5
R-05
Inventory stock updates are unreliable/inaccurate
50
3
0.6
R-06
Intake pipeline exceeds free-tier of LLM API
10
1
0.1

Mitigation Plan
To obtain more users, we will be actively promoting the project by using flyers within the pantry for students to see. We will also ask students who visit the Pantry to contribute if they are able. If those are still unsuccessful, our project team is already willing to make weekly trips to the pantry to update items, and the website will still be usable.

Due to the Pantry’s limited hours, we may be restricted on the times that we’re allowed to visit and update stock. This also applies to any student that visits. We’ve received permission from the Pantry manager Courtney Liang to visit the Pantry on Mondays and Fridays when the Pantry is usually closed. Our weekly rotation gives us the flexibility to visit weekly without issue.

Initially our plan was to have the pantry staff update the items in stock using our application so that it can be as up-to-date as possible. Since our initial interview with the manager, they have declined to participate directly as it affects their work. Instead, our approved solution of crowd-sourcing lets us continue to implement the project without disrupting the Pantry workers.

Since we are pivoting several weeks into the semester, this means that we are starting from scratch and have to redo everything including development, documentation, competitor research, and gathering user feedback. To lessen the impact of pivoting, we’ve decided to keep the scope of this pivot smaller than our initial project inception idea to be able to deliver an MVP by the end of the semester.
Keeping track of exact quantities for the inventory proves to be time consuming and inaccurate because the user is required to manually count items and even with the help of AI, it’s not completely accurate. Instead we opted to track item availability rather than a numerical quantity to still capture the idea of knowing something is available while making it easier for users to intake items and removing precision as a constraint.
We’ve tested the AI-intake in person and with the size of the pantry, it’s unlikely that we surpass the daily token limit for our LLM API. We have 4 tiers of fallbacks, with 3 of them being additional LLM models that do not share a daily token limit. Should all three models fail and surpass the limit, then the option to manually enter information is still possible.
Citations
[1] ISO, Ergonomics of human-system interaction — Part 210: Human-centred design for interactive systems, ISO Standard 9241-210:2019, 2019.
[2] Supercook, "Supercook: Recipe generator by ingredients," Google Play Store. [Online]. Available: https://play.google.com/store/apps/details?id=com.supercook.app. [Accessed: Sep. 2026].
[3] Paprika Software, "Paprika Recipe Manager 3," Paprika App. [Online]. Available: https://www.paprikaapp.com. [Accessed: Sep. 2026].
[4] Mealime Meal Plans Inc., "Mealime: Meal planning made easy," Mealime. [Online]. Available: https://www.mealime.com. [Accessed: Sep. 2026].
[5] The MealDB, "The MealDB open database API for recipe data," [Online]. Available: https://www.themealdb.com. [Accessed: Sep. 2026]
[6] Supabase Inc., "Supabase open source Firebase alternative documentation," [Online]. Available: https://supabase.com/docs. [Accessed: Sep. 2026].
[7] React Core Team, "React: JavaScript library for building user interfaces," [Online]. Available: https://react.dev. [Accessed: Sep. 2026].
[8] Vite Team, "Vite: Next Generation Frontend Tooling," [Online]. Available: https://vite.dev. [Accessed: Sep. 2026].
[9] ISO, Ergonomics of human-system interaction — Part 210: Human-centred design for interactive systems, ISO Standard 9241-210:2019, 2019.
[10] Scanlily, "Scanlily QR Code Asset Management and Inventory," Scanlily. [Online]. Available: https://scanlily.com. [Accessed: Oct. 2026]
[11] PantrySoft, "PantrySoft Food Bank and Pantry Management Software," PantrySoft. [Online]. Available: https://pantrysoft.com. [Accessed: Oct. 2026].
[12] Meta, "UTA Maverick Pantry Official Instagram Profile," Instagram. [Online]. Available: https://www.instagram.com/utarlingtonpantry. [Accessed: Oct. 2026].
