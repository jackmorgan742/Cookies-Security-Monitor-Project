Cookies Security Monitor – Project Specifications

John Morgan, Marcus Maravilla, Ian Thompson, Carter Payne
 
1. Introduction
Web cookies play a crucial role in modern browsing by storing session data, user preferences, and authentication tokens. However, cookies also introduce security and privacy risks. Features like the Secure and HttpOnly flags strengthen cookie protection, while third-party cookies raise concerns about cross-site tracking and data collection. 
The Cookies Security Monitor project aims to develop a Chrome extension that enhances user awareness of website tracking practices. The extension will provide a clear and interactive display of all cookies used by a visited website, including their types and purposes. When a user logs into a website, the extension will compare and display the state of cookies before and after login; highlighting newly created, modified, or removed cookies. Additionally, it will include a real-time notification system that alerts users whenever a new cookie is generated, along with detailed metadata such as its classification (e.g., session, persistent, third-party) and security attributes (e.g., Secure, HttpOnly, SameSite). This tool is designed to promote transparency and empower users to better understand and manage the privacy implications of cookie usage across websites.
 2. Project Goals
 	The main goals of this project are:
•	Cookie Attribute Analysis: Detect and display important security-relevant cookie attributes (Secure, HttpOnly, SameSite, Expiration).
•	Third-Party Cookie Identification: Detect cookies set by domains other than the visited site.
•	A real-time notification system that alerts users whenever a new cookie is generated
•	Security Risk Monitoring: Flag cookies missing protection or enabling cross-site tracking.
•	User Interface (Prototype/Simulation): Display cookie details with secure vs. risky indicators.
•	Expected Outcomes - A functional prototype listing cookies, analyzing attributes, and classifying risks. A report with findings on common websites. An educational tool to demonstrate cookie security concepts.

 3. Implementation Plan
1.	Research Phase: Review cookie standards (RFC 6265) and browser APIs (Chrome/Firefox provide chrome.cookies or browser.cookies APIs, which let you list, read, and modify cookies).
2.	Development Phase: Build analysis module, detect third-party cookies, and create interface.
3.	Testing Phase: Validate multiple websites. Most tests are without login but we will do some websites with login. Some websites for example, may include; News/media: bbc.com, cnn.com; Retail: amazon.com, walmart.com, target.com; Developer/infra: github.com, cloudflare.com.
4.	Final Deliverables: Documentation, demo, and presentation.

4.	Deliverables
- Measurements of what cookies are secure vs insecure
- What % of websites have x amount of cookie attributes
- Presentation about our findings
 5. Conclusion
The Cookies Security Monitor will provide insights into the often-overlooked security aspects of cookies. By focusing on security-relevant attributes and third-party tracking risks, this project will raise awareness of web privacy issues and serve as a practical tool for both students and developers.
