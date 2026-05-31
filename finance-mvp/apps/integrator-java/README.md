Spring Boot integrator service (mock)

Run locally:

mvn -f apps/integrator-java clean package
java -jar apps/integrator-java/target/integrator-0.0.1-SNAPSHOT.jar

This service exposes a simple endpoint for account aggregation used as a placeholder for external aggregator integration.

