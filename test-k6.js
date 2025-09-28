// To run this test, use the command:
// k6 run --duration 30s --vus 5 test-k6.js

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

// Custom metrics for health endpoint testing
const errorRate = new Rate("errors");
const responseTimeTrend = new Trend("response_time");
const healthResponseTime = new Trend("health_response_time");

// Test configuration
export const options = {
  stages: [
    { duration: "30s", target: 1000 }, // Ramp up to 10 users over 30 seconds
    { duration: "1m", target: 10000 }, // Stay at 10 users for 1 minute
    { duration: "30s", target: 0 }, // Ramp down to 0 users
  ],
  thresholds: {
    http_req_duration: ["p(95)<500"], // 95% of requests should be below 500ms
    http_req_failed: ["rate<0.1"], // Error rate should be below 10%
    errors: ["rate<0.1"], // Custom error rate
  },
};

// Base URL
const BASE_URL = "http://localhost:3000";

// Setup function to authenticate and get token
export function setup() {
  const testUser = {
    email: "k6test@test.com",
    password: "k6test123",
    username: "k6testuser",
  };

  // First, try to register the user
  const registerPayload = JSON.stringify(testUser);
  const registerResponse = http.post(
    `${BASE_URL}/auth/register`,
    registerPayload,
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  // Check registration result
  const registerCheck = check(registerResponse, {
    "register successful or user exists": (r) =>
      r.status === 200 || r.status === 400,
    "registration response valid": (r) => {
      try {
        const json = r.json();
        return json.hasOwnProperty("success") && json.hasOwnProperty("message");
      } catch {
        return false;
      }
    },
  });

  if (registerResponse.status === 200) {
    console.log("User registered successfully");
  } else if (registerResponse.status === 400) {
    const errorData = registerResponse.json();
    if (errorData.message && errorData.message.includes("already exists")) {
      console.log("User already exists, proceeding with login");
    } else {
      console.log("Registration failed with error:", errorData.message);
    }
  } else {
    console.error(
      "Registration failed with unexpected status:",
      registerResponse.status,
      registerResponse.body
    );
  }

  // Then attempt to login
  const loginPayload = JSON.stringify({
    email: testUser.email,
    password: testUser.password,
  });

  const loginResponse = http.post(`${BASE_URL}/auth/login`, loginPayload, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  check(loginResponse, {
    "login successful": (r) => r.status === 200,
    // "has token": (r) => r.json().hasOwnProperty("accessToken"),
  });

  if (loginResponse.status !== 200) {
    console.error("Login failed:", loginResponse.body);
    return null;
  }

  const accessToken = loginResponse.json().data.accessToken;
  return { accessToken };
}

// Main test function - focused on health endpoint testing
export default function (data) {
  if (!data || !data.accessToken) {
    console.log(data);
    console.error("No token available, skipping test");
    return;
  }

  const headers = {
    Authorization: `Bearer ${data.accessToken}`,
    "Content-Type": "application/json",
  };

  // Comprehensive health endpoint testing
  testHealthEndpoint("GET", "/health", headers, "Main Health Check");
  testHealthEndpoint(
    "GET",
    "/auth/health",
    headers,
    "Auth Module Health Check"
  );
  testHealthEndpoint("GET", "/", headers, "Root Endpoint Health Check");

  // Simulate user think time
  sleep(Math.random() * 2 + 1); // 1-3 seconds
}

// Helper function to test health endpoints
function testHealthEndpoint(method, endpoint, headers, description) {
  const startTime = new Date().getTime();

  let response;
  if (method === "GET") {
    response = http.get(`${BASE_URL}${endpoint}`, { headers });
  } else if (method === "POST") {
    response = http.post(`${BASE_URL}${endpoint}`, null, { headers });
  }

  const endTime = new Date().getTime();
  const duration = endTime - startTime;

  responseTimeTrend.add(duration);
  healthResponseTime.add(duration);

  const checkResult = check(response, {
    [`${description} - status is 200`]: (r) => r.status === 200,
    [`${description} - response time < 100ms`]: (r) => r.timings.duration < 100,
    // [`${description} - has valid JSON response`]: (r) => {
    //   try {
    //     const json = r.json();
    //     return json.hasOwnProperty("success") || json.hasOwnProperty("message");
    //   } catch (e) {
    //     return false;
    //   }
    // },
    // [`${description} - response indicates healthy service`]: (r) => {
    //   try {
    //     const json = r.json();
    //     return json.success === true || json.message?.includes("running");
    //   } catch (e) {
    //     return false;
    //   }
    // },
  });

  if (!checkResult) {
    errorRate.add(1);
    console.log(
      `Failed ${description}: Status ${response.status}, Duration ${duration}ms`
    );
  } else {
    console.log(`Success ${description}: Duration ${duration}ms`);
  }
}

// Teardown function for cleanup and final insights
export function teardown(data) {
  console.log(
    "\n=== K6 Health Endpoint Load Test Insights for ElyLiteChat API ==="
  );
  console.log("Test completed. Check the summary above for detailed metrics.");
  console.log("\nKey Metrics to Analyze:");
  console.log("- http_req_duration: Overall response time distribution");
  console.log("- http_req_failed: Overall failure rate");
  console.log("- errors: Custom error rate");
  console.log("- response_time: Overall trend of response times");
  console.log(
    "- health_response_time: Response times for all health endpoints"
  );
  console.log("\nThresholds:");
  console.log("- 95% of requests should complete in < 500ms");
  console.log("- Error rate should be < 10%");
  console.log("\nHealth Endpoint Performance Summary:");
  console.log("- Main Health Check (/health): Overall service health");
  console.log(
    "- Auth Module Health (/auth/health): Authentication service health"
  );
  console.log("- Root Endpoint Health (/): Basic service routing health");
  console.log("\nRecommendations:");
  console.log("- All health endpoints should respond quickly and reliably");
  console.log(
    "- Monitor response times to ensure health checks don't become bottlenecks"
  );
  console.log(
    "- Health endpoints should be lightweight and not depend on heavy operations"
  );
  console.log(
    "- Consider implementing circuit breakers if health endpoints fail"
  );
  console.log("- Use health check results for load balancer decisions");
  console.log(
    "- Ensure health endpoints work without authentication for external monitoring"
  );
}

// To run this test, use the command:
// k6 run --duration 30s --vus 5 test-k6.js
