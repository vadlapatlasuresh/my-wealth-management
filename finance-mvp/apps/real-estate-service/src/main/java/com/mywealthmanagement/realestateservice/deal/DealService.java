package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.common.Urls;
import com.mywealthmanagement.realestateservice.deal.dto.DealDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestRequest;
import com.mywealthmanagement.realestateservice.deal.dto.MyInterestDto;
import com.mywealthmanagement.realestateservice.sponsor.SponsorProjectRepository;
import com.mywealthmanagement.realestateservice.storage.DealImageStorageService;
import com.mywealthmanagement.realestateservice.sponsor.SponsorProjectService;
import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CRUD for the passive property directory. Every operation is scoped to the
 * authenticated user; a listing owned by someone else is indistinguishable from a
 * non-existent one (returns 404) to avoid leaking existence (IDOR-safe).
 *
 * <p>The directory is informational only. It does not vet or endorse listings, give
 * advice, or facilitate any transaction — so this service deliberately neither accepts
 * nor returns returns, yields, IRR, minimum entry amounts or raise progress. Contact
 * happens off-platform between the two parties.
 */
@Service
@RequiredArgsConstructor
public class DealService {

    /** A listing shows what the property looks like; it is not a media host. */
    public static final int MAX_IMAGES = 2;

    private final DealRepository dealRepository;
    private final DealInterestRepository interestRepository;
    private final SponsorProjectRepository sponsorProjectRepository;
    private final DealWatchRepository watchRepository;
    private final DealImageRepository imageRepository;
    private final DealImageStorageService imageStorage;
    private final LeadNotifier leadNotifier;
    private final com.mywealthmanagement.realestateservice.comms.NotificationClient notificationClient;
    private final DealBroadcaster dealBroadcaster;
    private final com.mywealthmanagement.realestateservice.audit.AuditClient auditClient;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /** The owner's own listings. */
    public List<DealDto> getDeals() {
        return getDeals(getUserId());
    }

    /** Same, for an explicit user — used by the customer-care read-only view. */
    public List<DealDto> getDeals(Long userId) {
        return toDtos(dealRepository.findByUserIdOrderByCreatedAtDesc(userId));
    }

    /**
     * The public directory: OPEN listings from every poster, optionally filtered by
     * category and property type, with pagination. Blank/null params ignored.
     *
     * <p>Sorting is by recency only. There is deliberately no "best performing" or
     * "lowest entry" ordering — ranking listings by financial attractiveness is exactly
     * the editorial judgement a passive directory must not make.
     *
     * @param limit  max results (default 24, capped at 100); offset for paging.
     */
    public List<DealDto> getMarketplace(String category, String subcategory,
                                        Integer limit, Integer offset) {
        String cat = trimUpperOrNull(category);
        String sub = trimUpperOrNull(subcategory);
        List<Deal> filtered = dealRepository.findByStatusOrderByCreatedAtDesc("OPEN").stream()
                .filter(d -> cat == null || cat.equals(d.getCategory()))
                .filter(d -> sub == null || sub.equals(d.getSubcategory()))
                .sorted(Comparator.comparing(
                        Deal::getCreatedAt, Comparator.nullsLast(Comparator.<LocalDateTime>naturalOrder())).reversed())
                .collect(Collectors.toList());

        int from = Math.max(0, offset == null ? 0 : offset);
        int size = Math.min(100, (limit == null || limit <= 0) ? 24 : limit);
        int to = Math.min(filtered.size(), from + size);
        if (from >= filtered.size()) {
            return List.of();
        }
        return toDtos(filtered.subList(from, to));
    }

    // ---- Watchlist (saved listings) ----

    public void watch(Long dealId) {
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        Long userId = getUserId();
        if (!watchRepository.existsByUserIdAndDealId(userId, deal.getId())) {
            DealWatch w = new DealWatch();
            w.setUserId(userId);
            w.setDealId(deal.getId());
            watchRepository.save(w);
        }
    }

    @Transactional
    public void unwatch(Long dealId) {
        watchRepository.deleteByUserIdAndDealId(getUserId(), dealId);
    }

    /** The investor's saved deals (only those that still exist). */
    public List<DealDto> getWatchlist() {
        List<Long> dealIds = watchRepository.findByUserIdOrderByCreatedAtDesc(getUserId()).stream()
                .map(DealWatch::getDealId).collect(Collectors.toList());
        Map<Long, Deal> deals = dealRepository.findAllById(dealIds).stream()
                .collect(Collectors.toMap(Deal::getId, d -> d));
        return toDtos(dealIds.stream().map(deals::get).filter(d -> d != null)
                .collect(Collectors.toList()));
    }

    /** The taxonomy (categories, property types, statuses) for building UI dropdowns. */
    public Map<String, Object> getTaxonomy() {
        Map<String, Object> t = new java.util.LinkedHashMap<>();
        t.put("categories", DealTaxonomy.CATEGORIES);
        t.put("subcategories", DealTaxonomy.SUBCATEGORIES);
        t.put("statuses", DealTaxonomy.STATUSES);
        return t;
    }

    /** Owner can view their listing in any status; everyone else only if it is OPEN. */
    public DealDto getDeal(Long id) {
        Deal deal = dealRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        boolean isOwner = deal.getUserId().equals(getUserId());
        if (!isOwner && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return toDto(deal);
    }

    /**
     * Record that the current user asked for an OPEN listing's contact details, so they can
     * find it again under "My Interests". The poster's email is handed to the browser as a
     * mailto: link; this platform sends nothing on anyone's behalf and brokers no
     * introduction. A user cannot request contact details for their own listing.
     */
    public DealInterestDto requestContactInfo(Long dealId, DealInterestRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing details");
        }
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        if (!"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This listing is not published");
        }
        Long userId = getUserId();
        if (deal.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You posted this listing");
        }
        if (interestRepository.existsByDealIdAndInterestedUserId(deal.getId(), userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You've already requested contact details for this listing");
        }

        String name = request.getName() == null ? "" : request.getName().trim();
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (!email.contains("@")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required");
        }

        DealInterest interest = new DealInterest();
        interest.setDealId(deal.getId());
        interest.setOwnerUserId(deal.getUserId());
        interest.setInterestedUserId(userId);
        interest.setName(name);
        interest.setEmail(email);
        interest.setPhone(request.getPhone() == null ? null : request.getPhone().trim());
        interest.setMessage(request.getMessage() == null ? null : request.getMessage().trim());
        DealInterestDto saved = toInterestDto(interestRepository.save(interest));

        // Best-effort: let the poster know someone looked them up. Never fail the request.
        leadNotifier.notifyNewInterest(deal.getUserId(), deal.getTitle(), name);
        notificationClient.notify(userId, "DEAL", "Contact details requested",
                "You requested the contact details for \"" + deal.getTitle()
                        + "\". Any follow-up happens directly between you and the poster.", "dealAlerts");
        return saved;
    }

    /** The listings the current user has requested contact details for. */
    public List<MyInterestDto> getMyInterests() {
        List<DealInterest> interests = interestRepository.findByInterestedUserIdOrderByCreatedAtDesc(getUserId());
        Map<Long, Deal> deals = dealRepository.findAllById(
                        interests.stream().map(DealInterest::getDealId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(Deal::getId, d -> d));
        return interests.stream().map(i -> {
            Deal deal = deals.get(i.getDealId());
            return new MyInterestDto(
                    i.getId(), i.getDealId(),
                    deal != null ? deal.getTitle() : "(removed)",
                    deal != null ? deal.getStatus() : null,
                    i.getMessage(), i.getCreatedAt());
        }).collect(Collectors.toList());
    }

    /**
     * The poster's previously listed projects. Visible under the same rule as the listing
     * itself: the listing must be OPEN, or the caller must be its owner.
     */
    public List<SponsorProjectDto> getSponsorProjectsForDeal(Long dealId) {
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        boolean isOwner = deal.getUserId().equals(getUserId());
        if (!isOwner && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return sponsorProjectRepository.findByUserIdOrderByYearDescCreatedAtDesc(deal.getUserId()).stream()
                .map(SponsorProjectService::toDto)
                .collect(Collectors.toList());
    }

    public DealDto createDeal(DealDto dto) {
        Deal deal = new Deal();
        deal.setUserId(getUserId());
        applyEditableFields(deal, dto, true);
        Deal saved = dealRepository.save(deal);
        auditClient.record(String.valueOf(saved.getUserId()), "deal.create", "SUCCESS", "dealId=" + saved.getId());
        // A deal created directly as OPEN is immediately live — broadcast it to the marketplace.
        if ("OPEN".equals(saved.getStatus())) {
            dealBroadcaster.broadcastNewDeal(saved.getUserId(), saved.getTitle(), saved.getCategory());
        }
        return toDto(saved);
    }

    public DealDto updateDeal(Long id, DealDto dto) {
        Deal deal = findOwnedOrThrow(id);
        String previousStatus = deal.getStatus();
        applyEditableFields(deal, dto, false);
        Deal saved = dealRepository.save(deal);
        // Best-effort: a status change (e.g. OPEN -> FUNDED / CLOSED) is worth telling watchers about.
        if (previousStatus != null && !previousStatus.equals(saved.getStatus())) {
            notifyWatchers(saved,
                    watcher -> leadNotifier.notifyWatcherStatusChanged(watcher, saved.getTitle(), saved.getStatus()));
        }
        // Publishing (DRAFT/other -> OPEN) makes the deal live — broadcast it to the marketplace.
        if (!"OPEN".equals(previousStatus) && "OPEN".equals(saved.getStatus())) {
            dealBroadcaster.broadcastNewDeal(saved.getUserId(), saved.getTitle(), saved.getCategory());
        }
        return toDto(saved);
    }

    @Transactional
    public void deleteDeal(Long id) {
        Deal deal = findOwnedOrThrow(id);
        // Take the photos and their stored bytes down with the listing, so deleting a
        // listing does not strand objects in the bucket.
        for (DealImage image : imageRepository.findByDealIdOrderBySortOrderAscIdAsc(id)) {
            imageStorage.delete(image.getObjectName());
        }
        imageRepository.deleteByDealId(id);
        dealRepository.delete(deal);
    }

    /**
     * Fan out a deal notification to every user watching {@code deal}, skipping the owner
     * (who triggered the change). Best-effort: a lookup/dispatch error never fails the action.
     */
    private void notifyWatchers(Deal deal, java.util.function.Consumer<Long> notify) {
        try {
            for (DealWatch watch : watchRepository.findByDealId(deal.getId())) {
                if (!watch.getUserId().equals(deal.getUserId())) {
                    notify.accept(watch.getUserId());
                }
            }
        } catch (Exception e) {
            // Notifying watchers must never break the deal update itself.
        }
    }

    private Deal findOwnedOrThrow(Long id) {
        Deal deal = dealRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        if (!deal.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return deal;
    }

    private void applyEditableFields(Deal deal, DealDto dto, boolean creating) {
        String title = dto.getTitle() == null ? "" : dto.getTitle().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        deal.setTitle(title);

        String category = normalize(dto.getCategory(), DealTaxonomy.CATEGORIES, "OTHER");
        deal.setCategory(category);

        // Subcategory is optional, but if present must belong to the chosen category.
        String subcategory = trimUpperOrNull(dto.getSubcategory());
        if (subcategory != null && !DealTaxonomy.isValidSubcategory(category, subcategory)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid subcategory '" + subcategory + "' for category " + category);
        }
        deal.setSubcategory(subcategory);

        deal.setDescription(dto.getDescription());
        deal.setLocation(dto.getLocation());

        // The external link is mandatory: every listing must hand the reader off to the
        // poster's own site or offering portal rather than resolving anything here.
        String websiteUrl = Urls.validateOrNull(dto.getWebsiteUrl(), "websiteUrl");
        if (websiteUrl == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "An external listing URL is required");
        }
        deal.setWebsiteUrl(websiteUrl);

        String contactEmail = trimToNull(dto.getContactEmail());
        if (contactEmail != null && !contactEmail.contains("@")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "contactEmail must be a valid email");
        }
        deal.setContactEmail(contactEmail);
        deal.setContactPhone(trimToNull(dto.getContactPhone()));
        if (deal.getContactEmail() == null && deal.getContactPhone() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide a contact email or phone number for inquiries");
        }

        // Status defaults to DRAFT on create; on update keep the existing value if omitted.
        String defaultStatus = creating ? "DRAFT" : deal.getStatus();
        deal.setStatus(normalize(dto.getStatus(), DealTaxonomy.STATUSES, defaultStatus));
    }

    private String trimToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String normalize(String value, Set<String> allowed, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String upper = value.trim().toUpperCase();
        if (!allowed.contains(upper)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid value: " + value);
        }
        return upper;
    }

    private String trimUpperOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toUpperCase();
    }

    // ---- Property photos ----

    /**
     * Attach a photo to one of the caller's listings. Capped at {@link #MAX_IMAGES}; the
     * bytes go to object storage and the row keeps only the pointer.
     */
    public DealDto addImage(Long dealId, org.springframework.web.multipart.MultipartFile file) {
        Deal deal = findOwnedOrThrow(dealId);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No photo was uploaded");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_IMAGE_TYPES.contains(contentType.toLowerCase())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Photos must be JPEG, PNG or WebP");
        }
        if (imageRepository.countByDealId(dealId) >= MAX_IMAGES) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A listing can have at most " + MAX_IMAGES + " photos");
        }
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded photo");
        }
        DealImageStorageService.Stored stored =
                imageStorage.upload(dealId, file.getOriginalFilename(), contentType, bytes);

        DealImage image = new DealImage();
        image.setDealId(dealId);
        image.setOwnerUserId(deal.getUserId());
        image.setObjectName(stored.objectName());
        image.setContentType(stored.contentType());
        image.setSizeBytes(stored.size());
        image.setSortOrder((int) imageRepository.countByDealId(dealId));
        imageRepository.save(image);
        return toDto(deal);
    }

    /** Serve a photo's bytes. Same visibility rule as the listing: OPEN, or you own it. */
    public DealImageStorageService.Download getImageBytes(Long dealId, Long imageId) {
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        boolean isOwner = deal.getUserId().equals(getUserId());
        if (!isOwner && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        DealImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo not found"));
        if (!image.getDealId().equals(dealId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo not found");
        }
        return imageStorage.download(image.getObjectName());
    }

    /** Owner-only: remove a photo from a listing, and its stored bytes. */
    public void deleteImage(Long dealId, Long imageId) {
        findOwnedOrThrow(dealId);
        DealImage image = imageRepository.findById(imageId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo not found"));
        if (!image.getDealId().equals(dealId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Photo not found");
        }
        imageRepository.delete(image);
        imageStorage.delete(image.getObjectName());
    }

    private static final Set<String> ALLOWED_IMAGE_TYPES =
            Set.of("image/jpeg", "image/png", "image/webp");

    /** Clients never see storage keys — only this stable, authenticated path. */
    private static String imagePath(DealImage image) {
        return "/api/v1/deals/" + image.getDealId() + "/images/" + image.getId();
    }

    /** Map a list of listings, batch-loading their photos so this stays one extra query. */
    private List<DealDto> toDtos(List<Deal> deals) {
        if (deals.isEmpty()) {
            return List.of();
        }
        Map<Long, List<String>> byDeal = imageRepository
                .findByDealIdInOrderBySortOrderAscIdAsc(deals.stream().map(Deal::getId).collect(Collectors.toList()))
                .stream()
                .collect(Collectors.groupingBy(DealImage::getDealId,
                        Collectors.mapping(DealService::imagePath, Collectors.toList())));
        return deals.stream().map(d -> {
            DealDto dto = toDtoWithoutImages(d);
            dto.setImageUrls(byDeal.getOrDefault(d.getId(), List.of()));
            return dto;
        }).collect(Collectors.toList());
    }

    private DealDto toDto(Deal d) {
        DealDto dto = toDtoWithoutImages(d);
        dto.setImageUrls(imageRepository.findByDealIdOrderBySortOrderAscIdAsc(d.getId())
                .stream().map(DealService::imagePath).collect(Collectors.toList()));
        return dto;
    }

    private DealDto toDtoWithoutImages(Deal d) {
        DealDto dto = new DealDto();
        dto.setId(d.getId());
        dto.setTitle(d.getTitle());
        dto.setCategory(d.getCategory());
        dto.setSubcategory(d.getSubcategory());
        dto.setDescription(d.getDescription());
        dto.setLocation(d.getLocation());
        dto.setWebsiteUrl(d.getWebsiteUrl());
        dto.setContactEmail(d.getContactEmail());
        dto.setContactPhone(d.getContactPhone());
        dto.setStatus(d.getStatus());
        dto.setCreatedAt(d.getCreatedAt());
        dto.setUpdatedAt(d.getUpdatedAt());
        return dto;
    }

    private DealInterestDto toInterestDto(DealInterest i) {
        return new DealInterestDto(
                i.getId(),
                i.getDealId(),
                i.getName(),
                i.getEmail(),
                i.getPhone(),
                i.getMessage(),
                i.getCreatedAt()
        );
    }
}
