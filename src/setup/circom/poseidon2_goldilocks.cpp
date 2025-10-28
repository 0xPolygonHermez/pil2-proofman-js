#ifndef POSEIDON2_GOLDILOCKS
#define POSEIDON2_GOLDILOCKS

#include "poseidon2_goldilocks_constants.hpp"
#include "goldilocks_base_field.hpp"
#ifdef __AVX2__
    #include <immintrin.h>
#endif
// #include "circom.hpp"

inline void pow7(Goldilocks::Element &x)
{
    Goldilocks::Element x2 = x * x;
    Goldilocks::Element x3 = x * x2;
    Goldilocks::Element x4 = x2 * x2;
    x = x3 * x4;
};

inline void add_(Goldilocks::Element &x, const Goldilocks::Element *st)
{
    for (int i = 0; i < 12; ++i)
    {
        x = x + st[i];
    }
}
inline void prodadd_(Goldilocks::Element *x, const Goldilocks::Element D[12], const Goldilocks::Element &sum)
{
    for (int i = 0; i < 12; ++i)
    {
        x[i] = x[i]*D[i] + sum;
    }
}

inline void pow7add_(Goldilocks::Element *x, const Goldilocks::Element C[12])
{
    Goldilocks::Element x2[12], x3[12], x4[12];
    
    for (int i = 0; i < 12; ++i)
    {
        Goldilocks::Element xi = x[i] + C[i];
        x2[i] = xi * xi;
        x3[i] = xi * x2[i];
        x4[i] = x2[i] * x2[i];
        x[i] = x3[i] * x4[i];
    }
};

inline void matmul_m4_(Goldilocks::Element *x) {
    Goldilocks::Element t0 = x[0] + x[1];
    Goldilocks::Element t1 = x[2] + x[3];
    Goldilocks::Element t2 = x[1] + x[1] + t1;
    Goldilocks::Element t3 = x[3] + x[3] + t0;
    Goldilocks::Element t1_2 = t1 + t1;
    Goldilocks::Element t0_2 = t0 + t0;
    Goldilocks::Element t4 = t1_2 + t1_2 + t3;
    Goldilocks::Element t5 = t0_2 + t0_2 + t2;
    Goldilocks::Element t6 = t3 + t5;
    Goldilocks::Element t7 = t2 + t4;
    
    x[0] = t6;
    x[1] = t5;
    x[2] = t7;
    x[3] = t4;
}

inline void matmul_external_(Goldilocks::Element *x) {
    matmul_m4_(&x[0]);
    matmul_m4_(&x[4]);
    matmul_m4_(&x[8]);
    
    Goldilocks::Element stored[4] = {
        x[0] + x[4] + x[8],
        x[1] + x[5] + x[9],
        x[2] + x[6] + x[10],
        x[3] + x[7] + x[11],
    };
    
    for (int i = 0; i < 12; ++i)
    {
        x[i] = x[i] + stored[i % 4];
    }
}

#ifdef __AVX2__
const __m256i zero = _mm256_setzero_si256();

inline void add_avx_small(__m256i &st0, __m256i &st1, __m256i &st2, const Goldilocks::Element C_small[12])
{
    __m256i c0, c1, c2;
    Goldilocks::load_avx(c0, &(C_small[0]));
    Goldilocks::load_avx(c1, &(C_small[4]));
    Goldilocks::load_avx(c2, &(C_small[8]));

    Goldilocks::add_avx_b_small(st0, st0, c0);
    Goldilocks::add_avx_b_small(st1, st1, c1);
    Goldilocks::add_avx_b_small(st2, st2, c2);
}

inline void matmul_external_avx(__m256i &st0, __m256i &st1, __m256i &st2)
{

    __m256i t0_ = _mm256_permute2f128_si256(st0, st2, 0b00100000);
    __m256i t1_ = _mm256_permute2f128_si256(st1, zero, 0b00100000);
    __m256i t2_ = _mm256_permute2f128_si256(st0, st2, 0b00110001);
    __m256i t3_ = _mm256_permute2f128_si256(st1, zero, 0b00110001);
    __m256i c0 = _mm256_castpd_si256(_mm256_unpacklo_pd(_mm256_castsi256_pd(t0_), _mm256_castsi256_pd(t1_)));
    __m256i c1 = _mm256_castpd_si256(_mm256_unpackhi_pd(_mm256_castsi256_pd(t0_), _mm256_castsi256_pd(t1_)));
    __m256i c2 = _mm256_castpd_si256(_mm256_unpacklo_pd(_mm256_castsi256_pd(t2_), _mm256_castsi256_pd(t3_)));
    __m256i c3 = _mm256_castpd_si256(_mm256_unpackhi_pd(_mm256_castsi256_pd(t2_), _mm256_castsi256_pd(t3_)));

    __m256i t0, t0_2, t1, t1_2, t2, t3, t4, t5, t6, t7;
    Goldilocks::add_avx(t0, c0, c1);
    Goldilocks::add_avx(t1, c2, c3);
    Goldilocks::add_avx(t2, c1, c1);
    Goldilocks::add_avx(t2, t2, t1);
    Goldilocks::add_avx(t3, c3, c3);
    Goldilocks::add_avx(t3, t3, t0);
    Goldilocks::add_avx(t1_2, t1, t1);
    Goldilocks::add_avx(t0_2, t0, t0);
    Goldilocks::add_avx(t4, t1_2, t1_2);
    Goldilocks::add_avx(t4, t4, t3);
    Goldilocks::add_avx(t5, t0_2, t0_2);
    Goldilocks::add_avx(t5, t5, t2);
    Goldilocks::add_avx(t6, t3, t5);
    Goldilocks::add_avx(t7, t2, t4);

    // Step 1: Reverse unpacking
    t0_ = _mm256_castpd_si256(_mm256_unpacklo_pd(_mm256_castsi256_pd(t6), _mm256_castsi256_pd(t5)));
    t1_ = _mm256_castpd_si256(_mm256_unpackhi_pd(_mm256_castsi256_pd(t6), _mm256_castsi256_pd(t5)));
    t2_ = _mm256_castpd_si256(_mm256_unpacklo_pd(_mm256_castsi256_pd(t7), _mm256_castsi256_pd(t4)));
    t3_ = _mm256_castpd_si256(_mm256_unpackhi_pd(_mm256_castsi256_pd(t7), _mm256_castsi256_pd(t4)));

    // Step 2: Reverse _mm256_permute2f128_si256
    st0 = _mm256_permute2f128_si256(t0_, t2_, 0b00100000); // Combine low halves
    st2 = _mm256_permute2f128_si256(t0_, t2_, 0b00110001); // Combine high halves
    st1 = _mm256_permute2f128_si256(t1_, t3_, 0b00100000); // Combine low halves
    
    __m256i stored;
    Goldilocks::add_avx(stored, st0, st1);
    Goldilocks::add_avx(stored, stored, st2);

    Goldilocks::add_avx(st0, st0, stored);
    Goldilocks::add_avx(st1, st1, stored);
    Goldilocks::add_avx(st2, st2, stored);
};


inline void pow7_avx(__m256i &st0, __m256i &st1, __m256i &st2)
{
    __m256i pw2_0, pw2_1, pw2_2;
    Goldilocks::square_avx(pw2_0, st0);
    Goldilocks::square_avx(pw2_1, st1);
    Goldilocks::square_avx(pw2_2, st2);
    __m256i pw4_0, pw4_1, pw4_2;
    Goldilocks::square_avx(pw4_0, pw2_0);
    Goldilocks::square_avx(pw4_1, pw2_1);
    Goldilocks::square_avx(pw4_2, pw2_2);
    __m256i pw3_0, pw3_1, pw3_2;
    Goldilocks::mult_avx(pw3_0, pw2_0, st0);
    Goldilocks::mult_avx(pw3_1, pw2_1, st1);
    Goldilocks::mult_avx(pw3_2, pw2_2, st2);

    Goldilocks::mult_avx(st0, pw3_0, pw4_0);
    Goldilocks::mult_avx(st1, pw3_1, pw4_1);
    Goldilocks::mult_avx(st2, pw3_2, pw4_2);
};

#endif

void Poseidon12(uint64_t* im, uint *size_im, uint64_t *out, uint* size_out, uint64_t *in, uint *size_in)
{   

    Goldilocks::Element state[12];
    for(uint64_t i = 0; i < 12; ++i) {
        state[i] = Goldilocks::fromU64(in[i]);
    }

    uint64_t index = 0;
#ifdef __AVX2__
    __m256i st0, st1, st2;
    Goldilocks::load_avx(st0, &(state[0]));
    Goldilocks::load_avx(st1, &(state[4]));
    Goldilocks::load_avx(st2, &(state[8]));

    matmul_external_avx(st0, st1, st2);
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::store_avx(&(state[4]), st1);
    Goldilocks::store_avx(&(state[8]), st2);
    for (int i = 0; i < 12; i++) {
        im[index++] = Goldilocks::toU64(state[i]);
    }

    for (int r = 0; r < 4; r++)
    {
        add_avx_small(st0, st1, st2, &(Poseidon2GoldilocksConstants::C[12 * r]));
        pow7_avx(st0, st1, st2);
        matmul_external_avx(st0, st1, st2);

        Goldilocks::store_avx(&(state[0]), st0);
        Goldilocks::store_avx(&(state[4]), st1);
        Goldilocks::store_avx(&(state[8]), st2);
        for (int i = 0; i < 12; i++) {
            im[index++] = Goldilocks::toU64(state[i]);
        }
    }
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::Element state0_ = state[0];

    __m256i d0, d1, d2;
    Goldilocks::load_avx(d0, &(Poseidon2GoldilocksConstants::D[0]));
    Goldilocks::load_avx(d1, &(Poseidon2GoldilocksConstants::D[4]));
    Goldilocks::load_avx(d2, &(Poseidon2GoldilocksConstants::D[8]));

    __m256i part_sum;
    Goldilocks::Element partial_sum[4];
    Goldilocks::Element aux = state0_;
    for (int r = 0; r < 22; r++)
    {
        Goldilocks::add_avx(part_sum, st1, st2);
        Goldilocks::add_avx(part_sum, part_sum, st0);
        Goldilocks::store_avx(partial_sum, part_sum);
        Goldilocks::Element sum = partial_sum[0] + partial_sum[1] + partial_sum[2] + partial_sum[3];
        sum = sum - aux;

        im[index++] = Goldilocks::toU64(state0_);
        state0_ = state0_ + Poseidon2GoldilocksConstants::C[4 * 12 + r];
        pow7(state0_);
        sum = sum + state0_;    
            
        __m256i scalar1 = _mm256_set1_epi64x(sum.fe);
        Goldilocks::mult_avx(st0, st0, d0);
        Goldilocks::mult_avx(st1, st1, d1);
        Goldilocks::mult_avx(st2, st2, d2);
        Goldilocks::add_avx(st0, st0, scalar1);
        Goldilocks::add_avx(st1, st1, scalar1);
        Goldilocks::add_avx(st2, st2, scalar1);
        state0_ = state0_ * Poseidon2GoldilocksConstants::D[0] + sum;
        aux = aux * Poseidon2GoldilocksConstants::D[0] + sum;
        if (r == 10 || r == 21) {
            im[index++] = 0;
            Goldilocks::store_avx(&(state[0]), st0);
            Goldilocks::store_avx(&(state[4]), st1);
            Goldilocks::store_avx(&(state[8]), st2);
            
            im[index++] = Goldilocks::toU64(state0_);
            for (int i = 1; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }

    Goldilocks::store_avx(&(state[0]), st0);
    state[0] = state0_;
    Goldilocks::load_avx(st0, &(state[0]));

    for (int r = 0; r < 4; r++)
    {
        add_avx_small(st0, st1, st2, &(Poseidon2GoldilocksConstants::C[4 * 12 + 22 + 12 * r]));
        pow7_avx(st0, st1, st2);
        
        matmul_external_avx(st0, st1, st2);

        if (r < 3) {
            Goldilocks::store_avx(&(state[0]), st0);
            Goldilocks::store_avx(&(state[4]), st1);
            Goldilocks::store_avx(&(state[8]), st2);
            for (int i = 0; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::store_avx(&(state[4]), st1);
    Goldilocks::store_avx(&(state[8]), st2);
#else
    matmul_external_(state);
    
    for(uint64_t i = 0; i < 12; ++i) {
        im[index++] = Goldilocks::toU64(state[i]);
    }

    for (int r = 0; r < 4; r++)
    {
        pow7add_(state, &(Poseidon2GoldilocksConstants::C[r * 12]));
        matmul_external_(state);
        for(uint64_t i = 0; i < 12; ++i) {
            im[index++] = Goldilocks::toU64(state[i]);
        }
    }

    for (int r = 0; r < 22; r++)
    {
        im[index++] = Goldilocks::toU64(state[0]);
        state[0] = state[0] + Poseidon2GoldilocksConstants::C[4 * 12 + r];
        pow7(state[0]);
        Goldilocks::Element sum_ = Goldilocks::zero();
        add_(sum_, state);
        prodadd_(state, Poseidon2GoldilocksConstants::D, sum_);
        if (r == 10 || r == 21) {
            im[index++] = 0;
            im[index++] = Goldilocks::toU64(state[0]);
            for (int i = 1; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }

    for (int r = 0; r < 4; r++)
    {
        pow7add_(state, &(Poseidon2GoldilocksConstants::C[4 * 12 + 22 + r * 12]));
        matmul_external_(state);
        if(r < 3) {
            for(uint64_t i = 0; i < 12; ++i) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }
#endif

    for(uint64_t i = 0; i < 12; ++i) {
        out[i] = Goldilocks::toU64(state[i]);
    }
}



void CustPoseidon12(uint64_t *im,uint *size_im,uint64_t *out, uint* size_out,uint64_t *in, uint *size_in,uint64_t *key, uint *size_key)
{   
    Goldilocks::Element state[12];
    if (key[0] == 0 && key[1] == 0) {
        for(uint64_t i = 0; i < 12; ++i) {
            state[i] = Goldilocks::fromU64(in[i]);
        }
    } else if (key[0] == 1 && key[1] == 0) {
        state[0] = Goldilocks::fromU64(in[4]);
        state[1] = Goldilocks::fromU64(in[5]);
        state[2] = Goldilocks::fromU64(in[6]);
        state[3] = Goldilocks::fromU64(in[7]);
        state[4] = Goldilocks::fromU64(in[0]);
        state[5] = Goldilocks::fromU64(in[1]);
        state[6] = Goldilocks::fromU64(in[2]);
        state[7] = Goldilocks::fromU64(in[3]);
        state[8] = Goldilocks::fromU64(in[8]);
        state[9] = Goldilocks::fromU64(in[9]);
        state[10] = Goldilocks::fromU64(in[10]);
        state[11] = Goldilocks::fromU64(in[11]);
    } else {
        state[0] = Goldilocks::fromU64(in[4]);
        state[1] = Goldilocks::fromU64(in[5]);
        state[2] = Goldilocks::fromU64(in[6]);
        state[3] = Goldilocks::fromU64(in[7]);
        state[4] = Goldilocks::fromU64(in[8]);
        state[5] = Goldilocks::fromU64(in[9]);
        state[6] = Goldilocks::fromU64(in[10]);
        state[7] = Goldilocks::fromU64(in[11]);
        state[8] = Goldilocks::fromU64(in[0]);
        state[9] = Goldilocks::fromU64(in[1]);
        state[10] = Goldilocks::fromU64(in[2]);
        state[11] = Goldilocks::fromU64(in[3]);
    }

    uint64_t index = 0;
#ifdef __AVX2__
    __m256i st0, st1, st2;
    Goldilocks::load_avx(st0, &(state[0]));
    Goldilocks::load_avx(st1, &(state[4]));
    Goldilocks::load_avx(st2, &(state[8]));

    matmul_external_avx(st0, st1, st2);
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::store_avx(&(state[4]), st1);
    Goldilocks::store_avx(&(state[8]), st2);
    for (int i = 0; i < 12; i++) {
        im[index++] = Goldilocks::toU64(state[i]);
    }

    for (int r = 0; r < 4; r++)
    {
        add_avx_small(st0, st1, st2, &(Poseidon2GoldilocksConstants::C[12 * r]));
        pow7_avx(st0, st1, st2);
        matmul_external_avx(st0, st1, st2);

        Goldilocks::store_avx(&(state[0]), st0);
        Goldilocks::store_avx(&(state[4]), st1);
        Goldilocks::store_avx(&(state[8]), st2);
        for (int i = 0; i < 12; i++) {
            im[index++] = Goldilocks::toU64(state[i]);
        }
    }
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::Element state0_ = state[0];

    __m256i d0, d1, d2;
    Goldilocks::load_avx(d0, &(Poseidon2GoldilocksConstants::D[0]));
    Goldilocks::load_avx(d1, &(Poseidon2GoldilocksConstants::D[4]));
    Goldilocks::load_avx(d2, &(Poseidon2GoldilocksConstants::D[8]));

    __m256i part_sum;
    Goldilocks::Element partial_sum[4];
    Goldilocks::Element aux = state0_;
    for (int r = 0; r < 22; r++)
    {
        Goldilocks::add_avx(part_sum, st1, st2);
        Goldilocks::add_avx(part_sum, part_sum, st0);
        Goldilocks::store_avx(partial_sum, part_sum);
        Goldilocks::Element sum = partial_sum[0] + partial_sum[1] + partial_sum[2] + partial_sum[3];
        sum = sum - aux;

        im[index++] = Goldilocks::toU64(state0_);
        state0_ = state0_ + Poseidon2GoldilocksConstants::C[4 * 12 + r];
        pow7(state0_);
        sum = sum + state0_;

        __m256i scalar1 = _mm256_set1_epi64x(sum.fe);
        Goldilocks::mult_avx(st0, st0, d0);
        Goldilocks::mult_avx(st1, st1, d1);
        Goldilocks::mult_avx(st2, st2, d2);
        Goldilocks::add_avx(st0, st0, scalar1);
        Goldilocks::add_avx(st1, st1, scalar1);
        Goldilocks::add_avx(st2, st2, scalar1);
        state0_ = state0_ * Poseidon2GoldilocksConstants::D[0] + sum;
        aux = aux * Poseidon2GoldilocksConstants::D[0] + sum;
        if (r == 10 || r == 21) {
            im[index++] = 0;
            Goldilocks::store_avx(&(state[0]), st0);
            Goldilocks::store_avx(&(state[4]), st1);
            Goldilocks::store_avx(&(state[8]), st2);
            
            im[index++] = Goldilocks::toU64(state0_);
            for (int i = 1; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }

    Goldilocks::store_avx(&(state[0]), st0);
    state[0] = state0_;
    Goldilocks::load_avx(st0, &(state[0]));

    for (int r = 0; r < 4; r++)
    {
        add_avx_small(st0, st1, st2, &(Poseidon2GoldilocksConstants::C[4 * 12 + 22 + 12 * r]));
        pow7_avx(st0, st1, st2);
        
        matmul_external_avx(st0, st1, st2);

        if (r < 3) {
            Goldilocks::store_avx(&(state[0]), st0);
            Goldilocks::store_avx(&(state[4]), st1);
            Goldilocks::store_avx(&(state[8]), st2);
            for (int i = 0; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
        
    }
    
    Goldilocks::store_avx(&(state[0]), st0);
    Goldilocks::store_avx(&(state[4]), st1);
    Goldilocks::store_avx(&(state[8]), st2);
#else
    matmul_external_(state);
    
    for(uint64_t i = 0; i < 12; ++i) {
        im[index++] = Goldilocks::toU64(state[i]);
    }

    for (int r = 0; r < 4; r++)
    {
        pow7add_(state, &(Poseidon2GoldilocksConstants::C[r * 12]));
        matmul_external_(state);
        for(uint64_t i = 0; i < 12; ++i) {
            im[index++] = Goldilocks::toU64(state[i]);
        }
    }

    for (int r = 0; r < 22; r++)
    {
        im[index++] = Goldilocks::toU64(state[0]);
        state[0] = state[0] + Poseidon2GoldilocksConstants::C[4 * 12 + r];
        pow7(state[0]);
        Goldilocks::Element sum_ = Goldilocks::zero();
        add_(sum_, state);
        prodadd_(state, Poseidon2GoldilocksConstants::D, sum_);
        if (r == 10 || r == 21) {
            im[index++] = 0;
            im[index++] = Goldilocks::toU64(state[0]);
            for (int i = 1; i < 12; i++) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }

    for (int r = 0; r < 4; r++)
    {
        pow7add_(state, &(Poseidon2GoldilocksConstants::C[4 * 12 + 22 + r * 12]));
        matmul_external_(state);
        if(r < 3) {
            for(uint64_t i = 0; i < 12; ++i) {
                im[index++] = Goldilocks::toU64(state[i]);
            }
        }
    }
#endif

    for(uint64_t i = 0; i < 12; ++i) {
        out[i] = Goldilocks::toU64(state[i]);
    }

}
#endif